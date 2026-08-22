import { publishManifest } from '../store/manifest.js'
import { getArmedTurnEntries, getBeforeDir, getChatDir, getReposFile } from '../store/paths.js'
import { readLines, canonicalize, isUnder, removeRecursive } from '../utils/files.js'
import { disposeWatchers, watchFilesOutsideWorkspace } from '../utils/watch.js'
import { captureBeforeImage, snapshotWorkspace } from './capture.js'
import { collectChanges } from './collect.js'
import { purgeSupersededTurns } from './purge.js'
import fs from 'fs'
import path from 'path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beginTurn = ({ project, sessionId }) => {
  const chatDir = getChatDir(project, sessionId)

  fs.mkdirSync(chatDir, { recursive: true })

  for (const entryPath of getArmedTurnEntries(chatDir)) removeRecursive(entryPath)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const armTurn = async ({ project, sessionId, payload, workspaceFolders }) => {
  let repositories

  const toolFile = payload.tool_input?.file_path || payload.tool_input?.notebook_path
  const file = toolFile && path.isAbsolute(toolFile) ? toolFile : null

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

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const endTurn = async ({ project, sessionId }) => {
  const chatDir = getChatDir(project, sessionId)
  const armed = fs.existsSync(getReposFile(chatDir))

  disposeWatchers(sessionId)

  if (!armed) return

  const stamp = Math.floor(Date.now() / 1000)
  const beforeDir = getBeforeDir(chatDir, stamp)

  const entries = await collectChanges(chatDir, beforeDir)

  for (const entryPath of getArmedTurnEntries(chatDir)) removeRecursive(entryPath)

  if (entries.length) {
    publishManifest(project, stamp, entries)
    purgeSupersededTurns({ project, sessionId, stamp, currentBeforeDir: beforeDir })
  } else {
    removeRecursive(beforeDir)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const HANDLERS = { begin: beginTurn, arm: armTurn, end: endTurn }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const handleTurn = async (mode, project, payload, workspaceFolders) => {
  const handler = HANDLERS[mode]
  const sessionId = payload?.session_id

  if (!handler || !sessionId || !project) return

  await handler({ project, sessionId, payload, workspaceFolders })
}
