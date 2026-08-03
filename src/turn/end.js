// Stop: diff the snapshots against the working tree, publish a manifest for
// the extension to render, and point refs/claude/turns at this turn.

const fs = require('fs')
const path = require('path')

const { chatDirFor, manifestFor } = require('../util/paths')
const { readLines, removeRecursive, canonical, isUnder } = require('../util/files')
const git = require('../util/git')
const { purgeSupersededTurns } = require('./purge')

// Collects one manifest entry per genuinely changed file. `beforeContents` is
// null when the file did not exist before the turn.
const createCollector = (beforeDir) => {
  const entries = []

  const add = (absolutePath, beforeContents) => {
    const beforeImage = path.join(beforeDir, absolutePath)
    fs.mkdirSync(path.dirname(beforeImage), { recursive: true })
    fs.writeFileSync(beforeImage, beforeContents === null ? '' : beforeContents)

    const existsNow = fs.existsSync(absolutePath)
    if (existsNow) {
      try {
        // A file can leave the tree without its contents changing — a new
        // .gitignore rule starting to match it, say. That is not a change.
        if (fs.readFileSync(beforeImage).equals(fs.readFileSync(absolutePath))) return
      } catch {}
    }

    entries.push({
      beforeImage,
      absolutePath,
      status: beforeContents === null ? 'A' : existsNow ? 'M' : 'D',
    })
  }

  return { entries, add }
}

const collectRepositoryChanges = async (chatDir, workingDir, collector) => {
  let cwdRepository = null

  for (const line of readLines(path.join(chatDir, 'repos.tsv'))) {
    const [repository, treeBefore] = line.split('\t')
    if (!repository || !treeBefore) continue

    const treeAfter = await git.snapshotTree(repository, chatDir)
    if (!treeAfter || treeAfter === treeBefore) continue
    if (!cwdRepository && isUnder(canonical(workingDir), repository)) {
      cwdRepository = { repository, treeBefore, treeAfter }
    }

    const changed = await git.nulSeparated([
      '-C', repository, 'diff', '--name-only', '-z', treeBefore, treeAfter,
    ])
    for (const relative of changed) {
      // The multi-diff editor resolves both sides through VS Code's text model
      // service, so a binary entry cannot render — it would be counted in the
      // title while missing from the view.
      if (await git.isBinaryChange(repository, treeBefore, treeAfter, relative)) continue
      const contents = await git.run(['-C', repository, 'show', `${treeBefore}:${relative}`])
      collector.add(path.join(repository, relative), contents)
    }
  }

  return cwdRepository
}

const collectOutsideChanges = (chatDir, collector) => {
  for (const line of readLines(path.join(chatDir, 'touched.tsv'))) {
    const [absolutePath, existedBefore] = line.split('\t')
    if (!absolutePath) continue

    let contents = null
    if (existedBefore === '1') {
      try {
        contents = fs.readFileSync(path.join(chatDir, 'blobs', absolutePath))
      } catch {}
    }
    collector.add(absolutePath, contents)
  }
}

// A detached ref holding only the latest turn. Rebuilt from HEAD each time
// rather than chained, so earlier turns go unreachable and normal gc reclaims
// them. `git show refs/claude/turns` is always exactly this turn.
const recordShadowRef = async ({ repository, treeBefore, treeAfter }, prompt) => {
  let parent = await git.text(['-C', repository, 'rev-parse', '-q', '--verify', 'HEAD'])
  const headTree = await git.text(['-C', repository, 'rev-parse', '-q', '--verify', 'HEAD^{tree}'])

  if (treeBefore !== headTree) {
    // the working tree already differed from HEAD when the turn began; record
    // that separately so the turn commit stays exactly Claude's changes
    const baseline = await git.text([
      '-C', repository, 'commit-tree', treeBefore,
      ...(parent ? ['-p', parent] : []),
      '-m', '· uncommitted state before this turn',
    ])
    if (baseline) parent = baseline
  }

  const commit = await git.text([
    '-C', repository, 'commit-tree', treeAfter,
    ...(parent ? ['-p', parent] : []),
    '-m', prompt,
  ])
  if (commit) await git.run(['-C', repository, 'update-ref', 'refs/claude/turns', commit])
}

const end = async ({ workingDir, sessionId }) => {
  const chatDir = chatDirFor(workingDir, sessionId)
  const armed =
    fs.existsSync(path.join(chatDir, 'repos.tsv')) || fs.existsSync(path.join(chatDir, 'touched.tsv'))
  if (!armed) return // nothing was written this turn

  const stamp = Math.floor(Date.now() / 1000)
  const beforeDir = path.join(chatDir, `before-${stamp}`)
  const collector = createCollector(beforeDir)

  const cwdRepository = await collectRepositoryChanges(chatDir, workingDir, collector)
  collectOutsideChanges(chatDir, collector)

  for (const consumed of ['repos.tsv', 'touched.tsv', 'blobs']) {
    removeRecursive(path.join(chatDir, consumed))
  }
  if (!collector.entries.length) {
    removeRecursive(beforeDir)
    return
  }

  if (cwdRepository) {
    let prompt = 'turn'
    try {
      prompt = fs.readFileSync(path.join(chatDir, 'prompt'), 'utf8') || prompt
    } catch {}
    await recordShadowRef(cwdRepository, prompt)
  }

  // Publish before purging. With parallel chats the manifest being replaced
  // may still be another chat's, and it must never point at before-images that
  // have already been deleted. The rename makes the swap atomic, so the
  // watcher cannot read a half-written file.
  const manifest = manifestFor(workingDir)
  fs.writeFileSync(
    `${manifest}.tmp`,
    JSON.stringify({
      title: 'Last turn changes',
      ts: `${stamp}-${process.pid}`,
      files: collector.entries.map((entry) => [
        entry.absolutePath,
        entry.beforeImage,
        entry.absolutePath,
        entry.status,
      ]),
    }),
  )
  fs.renameSync(`${manifest}.tmp`, manifest)

  purgeSupersededTurns({ workingDir, sessionId, stamp, currentBeforeDir: beforeDir })
}

module.exports = { end }
