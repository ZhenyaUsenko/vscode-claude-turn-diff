import { publishManifest, removeManifest } from '../store/manifest.js'
import { getArmedTurnPaths, getProjectDir, getSessionIdFile, getSnapshotsFile } from '../store/paths.js'
import { isTurnOver } from '../store/transcript.js'
import { canonicalize, isUnder, readFile, readLines, removeRecursive } from '../utils/files.js'
import { disposeOutsideWatchers, watchFilesOutsideWorkspace } from '../utils/watch.js'
import { captureTouchedFile, snapshotWorkspace } from './capture.js'
import { collectChanges, writeBeforeImages } from './collect.js'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const clearArmedState = (project) => {
  for (const armedTurnPath of getArmedTurnPaths(project)) removeRecursive(armedTurnPath)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beginTurn = ({ project }) => {
  mkdirSync(getProjectDir(project), { recursive: true })
  clearArmedState(project)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const armTurn = async ({ project, sessionId, payload, workspaceDirs }) => {
  let snapshots

  const toolPath = payload.tool_input?.file_path || payload.tool_input?.notebook_path
  const targetFile = toolPath && isAbsolute(toolPath) ? toolPath : null

  const snapshotsFile = getSnapshotsFile(project)

  if (targetFile) watchFilesOutsideWorkspace([targetFile], workspaceDirs)

  mkdirSync(getProjectDir(project), { recursive: true })

  if (existsSync(snapshotsFile)) {
    snapshots = readLines(snapshotsFile).map((line) => line.split('\t'))
  } else {
    writeFileSync(getSessionIdFile(project), sessionId)

    snapshots = await snapshotWorkspace(project, workspaceDirs)
  }

  if (!targetFile || snapshots.some(([repoDir]) => isUnder(canonicalize(targetFile), repoDir))) return

  captureTouchedFile(project, targetFile)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const endTurn = async ({ project, ended = true }) => {
  if (ended) disposeOutsideWatchers()

  if (!existsSync(getSnapshotsFile(project))) return

  const { changes, images } = await collectChanges(project)

  if (ended) clearArmedState(project)

  if (!changes.length) return

  removeManifest(project)
  writeBeforeImages(project, images)
  publishManifest(project, changes, { running: !ended })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const publishArmedTurn = async (project) => {
  if (!existsSync(getSnapshotsFile(project))) return

  const sessionId = readFile(getSessionIdFile(project), 'utf8')

  await endTurn({ project, ended: isTurnOver(project, sessionId) })
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
