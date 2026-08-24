import { publishManifest } from '../store/manifest.js'
import { getArmedTurnPaths, getBeforeDir, getChatDir, getSnapshotsFile } from '../store/paths.js'
import { readLines, canonicalize, isUnder, removeRecursive } from '../utils/files.js'
import { disposeWatchers, watchFilesOutsideWorkspace } from '../utils/watch.js'
import { captureTouchedFile, snapshotWorkspace } from './capture.js'
import { collectChanges } from './collect.js'
import { purgeSupersededTurns } from './purge.js'
import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beginTurn = ({ project, sessionId }) => {
  const chatDir = getChatDir(project, sessionId)

  mkdirSync(chatDir, { recursive: true })

  for (const armedTurnPath of getArmedTurnPaths(chatDir)) removeRecursive(armedTurnPath)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const armTurn = async ({ project, sessionId, payload, workspaceDirs }) => {
  let snapshots

  const toolPath = payload.tool_input?.file_path || payload.tool_input?.notebook_path
  const targetFile = toolPath && isAbsolute(toolPath) ? toolPath : null

  const chatDir = getChatDir(project, sessionId)
  const snapshotsFile = getSnapshotsFile(chatDir)

  if (targetFile) watchFilesOutsideWorkspace([targetFile], workspaceDirs, sessionId)

  mkdirSync(chatDir, { recursive: true })

  if (existsSync(snapshotsFile)) {
    snapshots = readLines(snapshotsFile).map((line) => line.split('\t'))
  } else {
    snapshots = await snapshotWorkspace(chatDir, workspaceDirs)
  }

  if (!targetFile) return
  if (snapshots.some(([repoDir]) => isUnder(canonicalize(targetFile), repoDir))) return

  captureTouchedFile(chatDir, targetFile)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const endTurn = async ({ project, sessionId }) => {
  const chatDir = getChatDir(project, sessionId)
  const armed = existsSync(getSnapshotsFile(chatDir))

  disposeWatchers(sessionId)

  if (!armed) return

  const stamp = Math.floor(Date.now() / 1000)
  const beforeDir = getBeforeDir(chatDir, stamp)

  const changes = await collectChanges(chatDir, beforeDir)

  for (const armedTurnPath of getArmedTurnPaths(chatDir)) removeRecursive(armedTurnPath)

  if (changes.length) {
    publishManifest(project, stamp, changes)
    purgeSupersededTurns({ project, sessionId, stamp, currentBeforeDir: beforeDir })
  } else {
    removeRecursive(beforeDir)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const HANDLERS = { begin: beginTurn, arm: armTurn, end: endTurn }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const handleTurn = async (mode, project, payload, workspaceDirs) => {
  const handler = HANDLERS[mode]
  const sessionId = payload?.session_id

  if (!handler || !sessionId || !project) return

  await handler({ project, sessionId, payload, workspaceDirs })
}
