const fs = require('fs')
const path = require('path')

const { chatDirFor, manifestFor } = require('../util/paths')
const { readLines, removeRecursive } = require('../util/files')
const git = require('../util/git')
const { purgeSupersededTurns } = require('./purge')
const { disposeWatchers } = require('../watch')

const SNAPSHOTS = ['repos.tsv', 'touched.tsv']

const CONSUMED = [...SNAPSHOTS, 'blobs']

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const createCollector = (beforeDir) => {
  const entries = []

  const add = (absolutePath, beforeContents) => {
    const beforeImage = path.join(beforeDir, absolutePath)

    fs.mkdirSync(path.dirname(beforeImage), { recursive: true })
    fs.writeFileSync(beforeImage, beforeContents === null ? '' : beforeContents)

    const existsNow = fs.existsSync(absolutePath)

    if (existsNow && fs.readFileSync(beforeImage).equals(fs.readFileSync(absolutePath))) return

    const status = beforeContents === null ? 'A' : existsNow ? 'M' : 'D'

    entries.push({ beforeImage, absolutePath, status })
  }

  return { entries, add }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectRepositoryChanges = async (chatDir, collector) => {
  for (const line of readLines(path.join(chatDir, 'repos.tsv'))) {
    const [repository, treeBefore] = line.split('\t')

    if (!repository || !treeBefore) continue

    const treeAfter = await git.snapshotTree(repository, chatDir)

    if (!treeAfter || treeAfter === treeBefore) continue

    const diff = ['-C', repository, 'diff', '--name-only', '-z', treeBefore, treeAfter]

    const changed = await git.nulSeparated(diff)

    for (const relative of changed) {
      if (await git.isBinaryChange(repository, treeBefore, treeAfter, relative)) continue

      const contents = await git.run(['-C', repository, 'show', `${treeBefore}:${relative}`])

      collector.add(path.join(repository, relative), contents)
    }
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectOutsideChanges = (chatDir, collector) => {
  for (const line of readLines(path.join(chatDir, 'touched.tsv'))) {
    const [absolutePath, existedBefore] = line.split('\t')

    if (!absolutePath) continue

    const blob = path.join(chatDir, 'blobs', absolutePath)
    const contents = existedBefore === '1' ? fs.readFileSync(blob) : null

    collector.add(absolutePath, contents)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const publish = (project, stamp, entries) => {
  const manifest = manifestFor(project)

  const files = entries.map((entry) => [entry.absolutePath, entry.beforeImage, entry.absolutePath, entry.status])

  const body = { title: 'Last turn changes', ts: `${stamp}-${process.pid}`, files }

  fs.writeFileSync(`${manifest}.tmp`, JSON.stringify(body))
  fs.renameSync(`${manifest}.tmp`, manifest)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const end = async ({ project, sessionId }) => {
  const chatDir = chatDirFor(project, sessionId)
  const armed = SNAPSHOTS.some((name) => fs.existsSync(path.join(chatDir, name)))

  disposeWatchers(sessionId)

  if (!armed) return

  const stamp = Math.floor(Date.now() / 1000)
  const beforeDir = path.join(chatDir, `before-${stamp}`)
  const collector = createCollector(beforeDir)

  await collectRepositoryChanges(chatDir, collector)

  collectOutsideChanges(chatDir, collector)

  for (const consumed of CONSUMED) removeRecursive(path.join(chatDir, consumed))

  if (!collector.entries.length) {
    removeRecursive(beforeDir)

    return
  }

  publish(project, stamp, collector.entries)
  purgeSupersededTurns({ project, sessionId, stamp, currentBeforeDir: beforeDir })
}

module.exports = { end }
