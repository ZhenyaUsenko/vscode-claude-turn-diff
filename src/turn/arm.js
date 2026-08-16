import { readLines, canonical, isUnder } from '../util/files.js'
import * as git from '../util/git.js'
import { chatDirFor } from '../util/paths.js'
import { watchOutsideWorkspace } from '../watch.js'
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

  for (const repository of await git.listRepositories(workspaceFolders)) {
    const tree = await git.snapshotTree(repository, chatDir)

    if (tree) snapshots.push([repository, tree])
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

const arm = async ({ project, sessionId, payload, workspaceFolders }) => {
  let repositories

  const file = targetedFile(payload)
  const chatDir = chatDirFor(project, sessionId)
  const reposFile = path.join(chatDir, 'repos.tsv')

  if (file) watchOutsideWorkspace([file], workspaceFolders, sessionId)

  fs.mkdirSync(chatDir, { recursive: true })

  if (fs.existsSync(reposFile)) {
    repositories = readLines(reposFile).map((line) => line.split('\t'))
  } else {
    repositories = await snapshotWorkspace(chatDir, workspaceFolders)
  }

  if (!file) return
  if (repositories.some(([repository]) => isUnder(canonical(file), repository))) return

  captureBeforeImage(chatDir, file)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { arm }
