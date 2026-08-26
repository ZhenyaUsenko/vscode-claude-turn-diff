import { readManifest } from '../../src/store/manifest.js'
import { getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { outputFile, removeFile } from '../../src/utils/files.js'
import { HOME } from './home.js'
import { basename, join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const registerChat = (dir, sessionId) => {
  const projectDir = join(HOME, '.claude', 'projects', getProjectKey(dir))

  outputFile(join(projectDir, `${sessionId}.jsonl`), '')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const forgetChat = (dir, sessionId) => {
  const projectDir = join(HOME, '.claude', 'projects', getProjectKey(dir))

  removeFile(join(projectDir, `${sessionId}.jsonl`))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readChangedFileNames = (dir) => {
  const manifest = readManifest(getProjectKey(dir))

  return manifest.changes.map((change) => basename(change.beforeFile)).sort()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const nextSecond = () => {
  return new Promise((resolve) => setTimeout(resolve, 1100))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const runTurn = async (dir, sessionId, workspaceDirs, mutate, params) => {
  const project = getProjectKey(dir)

  registerChat(dir, sessionId)

  await handleTurn('begin', project, { session_id: sessionId, prompt: 'p' }, workspaceDirs)
  await handleTurn('arm', project, { session_id: sessionId }, workspaceDirs)

  for (const file of params?.touchedFiles ?? []) {
    const payload = { session_id: sessionId, tool_input: { file_path: file } }

    await handleTurn('arm', project, payload, workspaceDirs)
  }

  mutate()

  await handleTurn('end', project, { session_id: sessionId }, workspaceDirs)
}
