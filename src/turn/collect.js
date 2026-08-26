import { getSnapshotsFile, getTouchCopiesDir, getTouchListFile } from '../store/paths.js'
import { compareFilesInTreeOrder, outputFile, readFile, readLines } from '../utils/files.js'
import { listChangedPaths, readBlobContents, snapshotTree } from '../utils/git.js'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const BINARY_SNIFF_BYTES = 8000

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isBinary = (contents) => {
  return contents?.subarray(0, BINARY_SNIFF_BYTES).includes(0) ?? false
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const addChange = (collector, beforeFile, afterFile, beforeContents) => {
  const afterContents = readFile(afterFile)

  if (beforeFile === afterFile && afterContents && beforeContents?.equals(afterContents)) return

  if (isBinary(beforeContents) || isBinary(afterContents)) return

  if (beforeContents != null) outputFile(join(collector.beforeDir, beforeFile), beforeContents)

  collector.changes.push({ beforeFile, afterFile })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectRepoChanges = async (chatDir, collector) => {
  for (const line of readLines(getSnapshotsFile(chatDir))) {
    const [repoDir, gitDir, treeBefore] = line.split('\t')

    const treeAfter = await snapshotTree(repoDir, gitDir, chatDir)

    if (!treeAfter || treeAfter === treeBefore) continue

    const changedPaths = await listChangedPaths(repoDir, treeBefore, treeAfter)

    changedPaths.sort((a, b) => compareFilesInTreeOrder(a.afterPath, b.afterPath))

    const beforePaths = changedPaths.map((changedPath) => changedPath.beforePath)

    const blobContents = await readBlobContents(repoDir, treeBefore, beforePaths)

    if (!blobContents) continue

    changedPaths.forEach(({ beforePath, afterPath }, index) => {
      addChange(collector, join(repoDir, beforePath), join(repoDir, afterPath), blobContents[index])
    })
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectOutsideChanges = (chatDir, collector) => {
  const touchedFiles = readLines(getTouchListFile(chatDir)).sort(compareFilesInTreeOrder)

  for (const touchedFile of touchedFiles) {
    const beforeContents = readFile(join(getTouchCopiesDir(chatDir), touchedFile))

    addChange(collector, touchedFile, touchedFile, beforeContents)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const collectChanges = async (chatDir, beforeDir) => {
  const collector = { beforeDir, changes: [] }

  mkdirSync(beforeDir, { recursive: true })

  await collectRepoChanges(chatDir, collector)

  collectOutsideChanges(chatDir, collector)

  return collector.changes
}
