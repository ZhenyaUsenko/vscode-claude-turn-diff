import { readLines, canonicalize, isUnder } from '../utils/files.js'
import { git } from '../utils/git.js'
import { getChatDir } from '../utils/paths.js'
import { watchFilesOutsideWorkspace } from '../utils/watch.js'
import { getBlobsDir, getReposFile, getTouchesFile } from './state.js'
import fs from 'fs'
import path from 'path'

const getTargetedFile = (payload) => {
  const file = payload.tool_input?.file_path || payload.tool_input?.notebook_path

  return file && path.isAbsolute(file) ? file : null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const snapshotWorkspace = async (chatDir, workspaceFolders) => {
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

const captureBeforeImage = (chatDir, file) => {
  const touchesFile = getTouchesFile(chatDir)
  const alreadySeenFiles = readLines(touchesFile).map((line) => line.split('\t')[0])

  if (alreadySeenFiles.includes(file)) return

  if (!fs.existsSync(file)) {
    fs.appendFileSync(touchesFile, `${file}\t0\n`)

    return
  }

  const blobPath = path.join(getBlobsDir(chatDir), file)

  fs.mkdirSync(path.dirname(blobPath), { recursive: true })
  fs.copyFileSync(file, blobPath)
  fs.appendFileSync(touchesFile, `${file}\t1\n`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const armTurn = async ({ project, sessionId, payload, workspaceFolders }) => {
  let repositories

  const file = getTargetedFile(payload)
  const chatDir = getChatDir(project, sessionId)
  const reposFile = getReposFile(chatDir)

  if (file) watchFilesOutsideWorkspace([file], workspaceFolders, sessionId)

  fs.mkdirSync(chatDir, { recursive: true })

  if (fs.existsSync(reposFile)) {
    repositories = readLines(reposFile).map((line) => line.split('\t'))
  } else {
    repositories = await snapshotWorkspace(chatDir, workspaceFolders)
  }

  if (!file) return
  if (repositories.some(([repository]) => isUnder(canonicalize(file), repository))) return

  captureBeforeImage(chatDir, file)
}
