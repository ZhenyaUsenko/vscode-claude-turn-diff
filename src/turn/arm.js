import { readLines, canonicalize, isUnder } from '../utils/files.js'
import { git } from '../utils/git.js'
import { getChatDir } from '../utils/paths.js'
import { watchFilesOutsideWorkspace } from '../utils/watch.js'
import fs from 'fs'
import path from 'path'

const targetedFile = (payload) => {
  const input = payload.tool_input
  const file = input?.file_path || input?.notebook_path

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

  fs.writeFileSync(path.join(chatDir, 'repos.tsv'), snapshots.length ? `${tsvBody}\n` : '')

  return snapshots
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const captureBeforeImage = (chatDir, file) => {
  const touchedFile = path.join(chatDir, 'touched.tsv')
  const alreadySeen = readLines(touchedFile).map((line) => line.split('\t')[0])

  if (alreadySeen.includes(file)) return

  if (!fs.existsSync(file)) {
    fs.appendFileSync(touchedFile, `${file}\t0\n`)

    return
  }

  const blobPath = path.join(chatDir, 'blobs', file)

  fs.mkdirSync(path.dirname(blobPath), { recursive: true })
  fs.copyFileSync(file, blobPath)
  fs.appendFileSync(touchedFile, `${file}\t1\n`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const armTurn = async ({ project, sessionId, payload, workspaceFolders }) => {
  let repositories

  const file = targetedFile(payload)
  const chatDir = getChatDir(project, sessionId)
  const reposFile = path.join(chatDir, 'repos.tsv')

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
