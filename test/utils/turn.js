import { readManifest } from '../../src/store/manifest.js'
import { getProjectKey, getTranscriptFile } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { outputFile, removeFile } from '../../src/utils/files.js'
import { appendFileSync } from 'node:fs'
import { basename } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const registerChat = (dir, sessionId) => {
  outputFile(getTranscriptFile(getProjectKey(dir), sessionId), '')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const forgetChat = (dir, sessionId) => {
  removeFile(getTranscriptFile(getProjectKey(dir), sessionId))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const appendTranscript = (dir, sessionId, entries) => {
  const written = entries.map((entry) => `${JSON.stringify(entry)}\n`).join('')

  appendFileSync(getTranscriptFile(getProjectKey(dir), sessionId), written)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const interruptTurn = (dir, sessionId) => {
  const content = [{ type: 'text', text: '[Request interrupted by user for tool use]' }]

  const interrupt = { type: 'user', message: { role: 'user', content } }
  const bookkeeping = { type: 'queue-operation', operation: 'enqueue' }

  appendTranscript(dir, sessionId, [interrupt, bookkeeping])
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const recordAssistantReply = (dir, sessionId, stopReason) => {
  const content = [{ type: 'text', text: 'a reply' }]

  const reply = { type: 'assistant', message: { role: 'assistant', content, stop_reason: stopReason } }

  appendTranscript(dir, sessionId, [reply])
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readChangedFileNames = (dir) => {
  const manifest = readManifest(getProjectKey(dir))

  return manifest.changes.map((change) => basename(change.beforeFile))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const nextSecond = () => {
  return new Promise((resolve) => setTimeout(resolve, 1100))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const startTurn = async (dir, sessionId, workspaceDirs, params) => {
  const project = getProjectKey(dir)

  registerChat(dir, sessionId)

  await handleTurn('begin', project, { session_id: sessionId }, workspaceDirs)
  await handleTurn('arm', project, { session_id: sessionId }, workspaceDirs)

  for (const file of params?.touchedFiles ?? []) {
    const payload = { session_id: sessionId, tool_input: { file_path: file } }

    await handleTurn('arm', project, payload, workspaceDirs)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const runTurn = async (dir, sessionId, workspaceDirs, mutate, params) => {
  await startTurn(dir, sessionId, workspaceDirs, params)

  mutate()

  await handleTurn('end', getProjectKey(dir), { session_id: sessionId }, workspaceDirs)
}
