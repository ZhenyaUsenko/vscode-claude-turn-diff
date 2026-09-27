import { getBeforeImagesDir, getSnapshotsFile, getTouchCopiesDir, getTouchListFile } from '../store/paths.js'
import { compareFilesInTreeOrder, outputFile, readFile, readLines, removeRecursive } from '../utils/files.js'
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

  if (beforeContents == null && afterContents == null) return

  if (beforeFile === afterFile && afterContents && beforeContents?.equals(afterContents)) return

  if (isBinary(beforeContents) || isBinary(afterContents)) return

  if (beforeContents != null) collector.images.push({ beforeFile, beforeContents })

  collector.changes.push({ beforeFile, afterFile })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectRepoChanges = async (project, collector) => {
  for (const line of readLines(getSnapshotsFile(project))) {
    const [repoDir, gitDir, treeBefore] = line.split('\t')

    const treeAfter = await snapshotTree(repoDir, gitDir)

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

const collectOutsideChanges = (project, collector) => {
  const touchedFiles = readLines(getTouchListFile(project)).sort(compareFilesInTreeOrder)

  for (const touchedFile of touchedFiles) {
    const beforeContents = readFile(join(getTouchCopiesDir(project), touchedFile))

    addChange(collector, touchedFile, touchedFile, beforeContents)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const collectChanges = async (project) => {
  const collector = { changes: [], images: [] }

  await collectRepoChanges(project, collector)

  collectOutsideChanges(project, collector)

  return collector
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const writeBeforeImages = (project, images) => {
  const beforeImagesDir = getBeforeImagesDir(project)

  removeRecursive(beforeImagesDir)
  mkdirSync(beforeImagesDir, { recursive: true })

  for (const { beforeFile, beforeContents } of images) {
    outputFile(join(beforeImagesDir, beforeFile), beforeContents)
  }
}
