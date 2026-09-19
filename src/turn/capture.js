import { getSnapshotsFile, getTouchCopiesDir, getTouchListFile } from '../store/paths.js'
import { canonicalize, isUnder, readLines } from '../utils/files.js'
import { listRepos, snapshotTree } from '../utils/git.js'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getCommandEffects } from 'shell-command-effects'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const snapshotWorkspace = async (project, workspaceDirs) => {
  const snapshots = []

  for (const { repoDir, gitDir } of await listRepos(workspaceDirs)) {
    const tree = await snapshotTree(repoDir, gitDir)

    if (tree) snapshots.push([repoDir, gitDir, tree])
  }

  writeFileSync(getSnapshotsFile(project), snapshots.map((snapshot) => `${snapshot.join('\t')}\n`).join(''))

  return snapshots
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const captureTouchedFile = (project, targetFile) => {
  const touchListFile = getTouchListFile(project)
  const alreadySeenFiles = readLines(touchListFile)

  if (alreadySeenFiles.includes(targetFile)) return

  if (existsSync(targetFile)) {
    const copiedFile = join(getTouchCopiesDir(project), targetFile)

    mkdirSync(dirname(copiedFile), { recursive: true })
    copyFileSync(targetFile, copiedFile)
  }

  appendFileSync(touchListFile, `${targetFile}\n`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const captureCommandFiles = (project, command, cwd, snapshots) => {
  const { files } = getCommandEffects(command, cwd)
  const isInsideRepo = (file) => snapshots.some(([repoDir]) => isUnder(canonicalize(file), repoDir))
  const outsideFiles = files.filter((file) => !isInsideRepo(file))

  for (const file of outsideFiles) captureTouchedFile(project, file)

  return outsideFiles
}
