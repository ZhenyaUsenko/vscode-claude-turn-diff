import { getBeforeImagesDir, getSnapshotsFile, getTouchCopiesDir, getTouchListFile } from '../store/paths.js'
import {
  compareFilesInTreeOrder, getFileSize, isBinary, outputFile, readFile, readLines, removeRecursive,
} from '../utils/files.js'
import { listChangedPaths, readBlobContents, readBlobSizes, snapshotTree } from '../utils/git.js'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const MAX_DIFF_BYTES = 50 * 1024 * 1024

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const addChange = (collector, beforeFile, afterFile, beforeContents) => {
  if (getFileSize(afterFile) > MAX_DIFF_BYTES) return

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
    const beforeSizes = await readBlobSizes(repoDir, treeBefore, changedPaths)

    if (!beforeSizes) continue

    const candidatePaths = changedPaths.filter((_, i) => beforeSizes[i] <= MAX_DIFF_BYTES)

    candidatePaths.sort((a, b) => compareFilesInTreeOrder(a.afterPath, b.afterPath))

    const blobContents = await readBlobContents(repoDir, treeBefore, candidatePaths)

    if (!blobContents) continue

    candidatePaths.forEach(({ beforePath, afterPath }, i) => {
      addChange(collector, join(repoDir, beforePath), join(repoDir, afterPath), blobContents[i])
    })
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectOutsideChanges = (project, collector) => {
  const touchedFiles = readLines(getTouchListFile(project)).sort(compareFilesInTreeOrder)

  for (const touchedFile of touchedFiles) {
    const copiedFile = join(getTouchCopiesDir(project), touchedFile)

    if (getFileSize(copiedFile) > MAX_DIFF_BYTES) continue

    addChange(collector, touchedFile, touchedFile, readFile(copiedFile))
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

  for (const image of images) outputFile(join(beforeImagesDir, image.beforeFile), image.beforeContents)
}
