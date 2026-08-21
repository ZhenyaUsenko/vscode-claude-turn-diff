import { getBlobsDir, getReposFile, getTouchesFile } from '../store/paths.js'
import { readLines } from '../utils/files.js'
import { git } from '../utils/git.js'
import fs from 'fs'
import path from 'path'

export const snapshotWorkspace = async (chatDir, workspaceFolders) => {
  const snapshots = []

  for (const [repository, gitDir] of await git.listRepositories(workspaceFolders)) {
    const tree = await git.snapshotTree(repository, gitDir, chatDir)

    if (tree) snapshots.push([repository, gitDir, tree])
  }

  const tsvBody = snapshots.map((entry) => entry.join('\t')).join('\n')

  fs.writeFileSync(getReposFile(chatDir), snapshots.length ? `${tsvBody}\n` : '')

  return snapshots
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const captureBeforeImage = (chatDir, file) => {
  const touchesFile = getTouchesFile(chatDir)
  const alreadySeenFiles = readLines(touchesFile).map((line) => line.split('\t')[0])

  if (alreadySeenFiles.includes(file)) return

  if (fs.existsSync(file)) {
    const blobPath = path.join(getBlobsDir(chatDir), file)

    fs.mkdirSync(path.dirname(blobPath), { recursive: true })
    fs.copyFileSync(file, blobPath)
    fs.appendFileSync(touchesFile, `${file}\t1\n`)
  } else {
    fs.appendFileSync(touchesFile, `${file}\t0\n`)
  }
}
