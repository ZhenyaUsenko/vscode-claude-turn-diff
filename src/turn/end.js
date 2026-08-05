// Stop: diff the snapshots against the working tree and publish a manifest for
// the extension to render.

const fs = require('fs')
const path = require('path')

const { chatDirFor, manifestFor } = require('../util/paths')
const { readLines, removeRecursive } = require('../util/files')
const git = require('../util/git')
const { purgeSupersededTurns } = require('./purge')
const { disposeWatchers } = require('../watch')

// Collects one manifest entry per genuinely changed file. `beforeContents` is
// null when the file did not exist before the turn.
const createCollector = (beforeDir) => {
  const entries = []

  const add = (absolutePath, beforeContents) => {
    const beforeImage = path.join(beforeDir, absolutePath)
    fs.mkdirSync(path.dirname(beforeImage), { recursive: true })
    fs.writeFileSync(beforeImage, beforeContents === null ? '' : beforeContents)

    // A file can leave the tree without its contents changing — a new
    // .gitignore rule starting to match it, say. That is not a change.
    const existsNow = fs.existsSync(absolutePath)
    if (existsNow && fs.readFileSync(beforeImage).equals(fs.readFileSync(absolutePath))) return

    entries.push({
      beforeImage,
      absolutePath,
      status: beforeContents === null ? 'A' : existsNow ? 'M' : 'D',
    })
  }

  return { entries, add }
}

const collectRepositoryChanges = async (chatDir, collector) => {
  for (const line of readLines(path.join(chatDir, 'repos.tsv'))) {
    const [repository, treeBefore] = line.split('\t')
    if (!repository || !treeBefore) continue

    const treeAfter = await git.snapshotTree(repository, chatDir)
    if (!treeAfter || treeAfter === treeBefore) continue

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
}

const collectOutsideChanges = (chatDir, collector) => {
  for (const line of readLines(path.join(chatDir, 'touched.tsv'))) {
    const [absolutePath, existedBefore] = line.split('\t')
    if (!absolutePath) continue

    const contents =
      existedBefore === '1' ? fs.readFileSync(path.join(chatDir, 'blobs', absolutePath)) : null
    collector.add(absolutePath, contents)
  }
}

const end = async ({ workingDir, sessionId }) => {
  disposeWatchers(sessionId)

  const chatDir = chatDirFor(workingDir, sessionId)
  const armed =
    fs.existsSync(path.join(chatDir, 'repos.tsv')) || fs.existsSync(path.join(chatDir, 'touched.tsv'))
  if (!armed) return // nothing was written this turn

  const stamp = Math.floor(Date.now() / 1000)
  const beforeDir = path.join(chatDir, `before-${stamp}`)
  const collector = createCollector(beforeDir)

  await collectRepositoryChanges(chatDir, collector)
  collectOutsideChanges(chatDir, collector)

  for (const consumed of ['repos.tsv', 'touched.tsv', 'blobs']) {
    removeRecursive(path.join(chatDir, consumed))
  }
  if (!collector.entries.length) {
    removeRecursive(beforeDir)
    return
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
