import { getSnapshotsFile, getTouchCopiesDir, getTouchListFile } from '../store/paths.js'
import { readLines } from '../utils/files.js'
import { listRepos, snapshotTree } from '../utils/git.js'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const snapshotWorkspace = async (chatDir, workspaceDirs) => {
  const snapshots = []

  for (const { repoDir, gitDir } of await listRepos(workspaceDirs)) {
    const tree = await snapshotTree(repoDir, gitDir, chatDir)

    if (tree) snapshots.push([repoDir, gitDir, tree])
  }

  const snapshotsFileContents = snapshots.map((snapshot) => snapshot.join('\t')).join('\n')

  writeFileSync(getSnapshotsFile(chatDir), snapshots.length ? `${snapshotsFileContents}\n` : '')

  return snapshots
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const captureTouchedFile = (chatDir, targetFile) => {
  const touchListFile = getTouchListFile(chatDir)
  const alreadySeenFiles = readLines(touchListFile)

  if (alreadySeenFiles.includes(targetFile)) return

  if (existsSync(targetFile)) {
    const copiedFile = join(getTouchCopiesDir(chatDir), targetFile)

    mkdirSync(dirname(copiedFile), { recursive: true })
    copyFileSync(targetFile, copiedFile)
  }

  appendFileSync(touchListFile, `${targetFile}\n`)
}
