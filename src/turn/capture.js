import { getBlobsDir, getReposFile, getTouchListFile } from '../store/paths.js'
import { readLines } from '../utils/files.js'
import { listRepositories, snapshotTree } from '../utils/git.js'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const snapshotWorkspace = async (chatDir, workspaceFolders) => {
  const snapshots = []

  for (const [repository, gitDir] of await listRepositories(workspaceFolders)) {
    const tree = await snapshotTree(repository, gitDir, chatDir)

    if (tree) snapshots.push([repository, gitDir, tree])
  }

  const tsvBody = snapshots.map((entry) => entry.join('\t')).join('\n')

  writeFileSync(getReposFile(chatDir), snapshots.length ? `${tsvBody}\n` : '')

  return snapshots
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const captureBeforeImage = (chatDir, file) => {
  const touchListFile = getTouchListFile(chatDir)
  const alreadySeenFiles = readLines(touchListFile)

  if (alreadySeenFiles.includes(file)) return

  if (existsSync(file)) {
    const blobPath = join(getBlobsDir(chatDir), file)

    mkdirSync(dirname(blobPath), { recursive: true })
    copyFileSync(file, blobPath)
  }

  appendFileSync(touchListFile, `${file}\n`)
}
