import { getManifestFile, getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { HOME } from './home.js'
import fs from 'fs'
import path from 'path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const registerChat = (dir, sessionId) => {
  const projectDir = path.join(HOME, '.claude', 'projects', getProjectKey(dir))

  fs.mkdirSync(projectDir, { recursive: true })
  fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), '')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const forgetChat = (dir, sessionId) => {
  const projectDir = path.join(HOME, '.claude', 'projects', getProjectKey(dir))

  fs.unlinkSync(path.join(projectDir, `${sessionId}.jsonl`))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readManifest = (dir) => {
  return JSON.parse(fs.readFileSync(getManifestFile(getProjectKey(dir)), 'utf8'))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readStatuses = (dir) => {
  const labels = readManifest(dir).files.map((entry) => `${entry.status} ${path.basename(entry.beforePath)}`)

  return labels.sort()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const nextSecond = () => {
  return new Promise((resolve) => setTimeout(resolve, 1100))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const runTurn = async (dir, sessionId, workspaceFolders, mutate, params) => {
  const project = getProjectKey(dir)

  registerChat(dir, sessionId)

  await handleTurn('begin', project, { session_id: sessionId, prompt: 'p' }, workspaceFolders)
  await handleTurn('arm', project, { session_id: sessionId }, workspaceFolders)

  for (const file of params?.touchedFiles ?? []) {
    const payload = { session_id: sessionId, tool_input: { file_path: file } }

    await handleTurn('arm', project, payload, workspaceFolders)
  }

  mutate()

  await handleTurn('end', project, { session_id: sessionId }, workspaceFolders)
}
