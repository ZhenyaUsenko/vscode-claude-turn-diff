import { getBlobsDir, getReposFile, getTouchesFile } from '../store/paths.js'
import { readLines } from '../utils/files.js'
import { git } from '../utils/git.js'
import fs from 'fs'
import path from 'path'

const BINARY_SNIFF_BYTES = 8000

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isBinary = (contents) => {
  return contents?.subarray(0, BINARY_SNIFF_BYTES).includes(0) ?? false
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const addEntry = (collector, beforePath, afterPath, beforeContents) => {
  const previousContents = beforeContents ?? Buffer.alloc(0)
  const currentContents = fs.existsSync(afterPath) ? fs.readFileSync(afterPath) : null

  const unchanged = currentContents && previousContents.equals(currentContents)

  if (unchanged && beforePath === afterPath) return
  if (isBinary(previousContents) || isBinary(currentContents)) return

  const beforeImage = path.join(collector.beforeDir, beforePath)
  const status = beforeContents == null ? 'A' : currentContents ? 'M' : 'D'

  fs.mkdirSync(path.dirname(beforeImage), { recursive: true })
  fs.writeFileSync(beforeImage, previousContents)

  collector.entries.push({ beforeImage, beforePath, afterPath, status })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectRepositoryChanges = async (chatDir, collector) => {
  for (const line of readLines(getReposFile(chatDir))) {
    const [repository, gitDir, treeBefore] = line.split('\t')

    const treeAfter = await git.snapshotTree(repository, gitDir, chatDir)

    if (!treeAfter || treeAfter === treeBefore) continue

    const changes = await git.listChanges(repository, treeBefore, treeAfter)

    const blobs = await git.readBlobs(repository, treeBefore, changes.map((change) => change.beforePath))

    if (!blobs) continue

    changes.forEach(({ beforePath, afterPath }, index) => {
      addEntry(collector, path.join(repository, beforePath), path.join(repository, afterPath), blobs[index])
    })
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collectOutsideChanges = (chatDir, collector) => {
  for (const line of readLines(getTouchesFile(chatDir))) {
    const [absolutePath, existedBefore] = line.split('\t')

    const blobFile = path.join(getBlobsDir(chatDir), absolutePath)
    const contents = existedBefore === '1' ? fs.readFileSync(blobFile) : null

    addEntry(collector, absolutePath, absolutePath, contents)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const collectChanges = async (chatDir, beforeDir) => {
  const collector = { beforeDir, entries: [] }

  await collectRepositoryChanges(chatDir, collector)

  collectOutsideChanges(chatDir, collector)

  return collector.entries
}
