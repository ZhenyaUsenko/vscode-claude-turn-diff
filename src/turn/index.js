import { publishManifest, removeManifest } from '../store/manifest.js'
import { getArmedTurnPaths, getProjectDir, getSessionIdFile, getSnapshotsFile } from '../store/paths.js'
import { isTurnInterrupted } from '../store/transcript.js'
import { canonicalize, isUnder, readFile, readLines, removeRecursive } from '../utils/files.js'
import { disposeOutsideWatchers, watchFilesOutsideWorkspace } from '../utils/watch.js'
import { captureTouchedFile, snapshotWorkspace } from './capture.js'
import { collectChanges, writeBeforeImages } from './collect.js'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const AGENT_TASK_TYPES = ['subagent', 'workflow']

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beginTurn = ({ project, sessionId }) => {
  mkdirSync(getProjectDir(project), { recursive: true })

  if (sessionId === readFile(getSessionIdFile(project), 'utf8') && !isTurnInterrupted(project, sessionId)) return

  for (const armedTurnPath of getArmedTurnPaths(project)) removeRecursive(armedTurnPath)
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

export const endTurn = async ({ project, payload, ended = true }) => {
  if (payload?.agent_id) return { published: false }

  const waitsForAgents = payload?.background_tasks?.some((task) => AGENT_TASK_TYPES.includes(task.type))

  const endsTurn = ended && !waitsForAgents && payload?.hook_event_name !== 'StopFailure'

  if (endsTurn) disposeOutsideWatchers()

  if (waitsForAgents || !existsSync(getSnapshotsFile(project))) return { published: false }

  const { changes, images } = await collectChanges(project)

  if (endsTurn) for (const armedTurnPath of getArmedTurnPaths(project)) removeRecursive(armedTurnPath)

  if (!changes.length) return { published: false }

  removeManifest(project)
  writeBeforeImages(project, images)
  publishManifest(project, changes, { running: !endsTurn })

  return { published: true }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const publishArmedTurn = async (project) => {
  if (!existsSync(getSnapshotsFile(project))) return

  const sessionId = readFile(getSessionIdFile(project), 'utf8')

  await endTurn({ project, ended: isTurnInterrupted(project, sessionId) })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const HANDLERS = { begin: beginTurn, arm: armTurn, end: endTurn }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const handleTurn = async (mode, project, payload, workspaceDirs) => {
  const handler = HANDLERS[mode]
  const sessionId = payload?.session_id

  if (!handler || !sessionId || !project) return

  return handler({ project, sessionId, payload, workspaceDirs })
}
