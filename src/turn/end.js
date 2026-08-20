import { BINARY_SNIFF_BYTES } from '../config.js'
import { readLines, removeRecursive } from '../util/files.js'
import { git } from '../util/git.js'
import { getChatDir, getManifestFile } from '../util/paths.js'
import { disposeWatchers } from '../watch.js'
import { purgeSupersededTurns } from './purge.js'
import fs from 'fs'
import path from 'path'

const SNAPSHOTS = ['repos.tsv', 'touched.tsv']

const CONSUMED_ENTRIES = [...SNAPSHOTS, 'blobs']

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isBinary = (contents) => {
  return contents.subarray(0, BINARY_SNIFF_BYTES).includes(0)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const addEntry = (collector, absolutePath, beforeContents) => {
  const beforeImage = path.join(collector.beforeDir, absolutePath)

  fs.mkdirSync(path.dirname(beforeImage), { recursive: true })
  fs.writeFileSync(beforeImage, beforeContents === null ? '' : beforeContents)

  const previousContents = fs.readFileSync(beforeImage)
  const currentContents = fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath) : null

  if (currentContents && previousContents.equals(currentContents)) return
  if (isBinary(previousContents) || (currentContents && isBinary(currentContents))) return

  const status = beforeContents === null ? 'A' : currentContents ? 'M' : 'D'

  collector.entries.push({ beforeImage, absolutePath, status })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectRepositoryChanges = async (chatDir, collector) => {
  for (const line of readLines(path.join(chatDir, 'repos.tsv'))) {
    const [repository, gitDir, treeBefore] = line.split('\t')

    if (!repository || !treeBefore) continue

    const treeAfter = await git.snapshotTree(repository, gitDir, chatDir)

    if (!treeAfter || treeAfter === treeBefore) continue

    const diffArgs = ['-C', repository, 'diff', '--name-only', '-z', treeBefore, treeAfter]

    const changedFiles = await git.listPaths(diffArgs)

    const blobs = await git.readBlobs(repository, treeBefore, changedFiles)

    if (!blobs) continue

    changedFiles.forEach((relativePath, index) => {
      addEntry(collector, path.join(repository, relativePath), blobs[index])
    })
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectOutsideChanges = (chatDir, collector) => {
  for (const line of readLines(path.join(chatDir, 'touched.tsv'))) {
    const [absolutePath, existedBefore] = line.split('\t')

    if (!absolutePath) continue

    const blobFile = path.join(chatDir, 'blobs', absolutePath)
    const contents = existedBefore === '1' ? fs.readFileSync(blobFile) : null

    addEntry(collector, absolutePath, contents)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const publish = (project, stamp, entries) => {
  const manifestFile = getManifestFile(project)

  const files = entries.map((entry) => [entry.absolutePath, entry.beforeImage, entry.absolutePath, entry.status])

  const manifestBody = { title: 'Last turn changes', ts: `${stamp}-${process.pid}`, files }

  fs.writeFileSync(`${manifestFile}.tmp`, JSON.stringify(manifestBody))
  fs.renameSync(`${manifestFile}.tmp`, manifestFile)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const endTurn = async ({ project, sessionId }) => {
  const chatDir = getChatDir(project, sessionId)
  const armed = SNAPSHOTS.some((name) => fs.existsSync(path.join(chatDir, name)))

  disposeWatchers(sessionId)

  if (!armed) return

  const stamp = Math.floor(Date.now() / 1000)
  const beforeDir = path.join(chatDir, `before-${stamp}`)
  const collector = { beforeDir, entries: [] }

  await collectRepositoryChanges(chatDir, collector)

  collectOutsideChanges(chatDir, collector)

  for (const consumed of CONSUMED_ENTRIES) removeRecursive(path.join(chatDir, consumed))

  if (!collector.entries.length) {
    removeRecursive(beforeDir)

    return
  }

  publish(project, stamp, collector.entries)
  purgeSupersededTurns({ project, sessionId, stamp, currentBeforeDir: beforeDir })
}
