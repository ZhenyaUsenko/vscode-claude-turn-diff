import { armTurn } from './arm.js'
import { beginTurn } from './begin.js'
import { endTurn } from './end.js'

const HANDLERS = { begin: beginTurn, arm: armTurn, end: endTurn }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const handleTurn = async (mode, project, payload, workspaceFolders) => {
  const handler = HANDLERS[mode]
  const sessionId = payload?.session_id

  if (!handler || !sessionId || !project) return

  await handler({ project, sessionId, payload, workspaceFolders })
}
