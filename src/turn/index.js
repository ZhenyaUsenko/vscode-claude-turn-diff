import { arm } from './arm.js'
import { begin } from './begin.js'
import { end } from './end.js'

const HANDLERS = { begin, arm, end }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const handle = async (mode, project, payload, workspaceFolders) => {
  const handler = HANDLERS[mode]
  const sessionId = payload?.session_id

  if (!handler || !sessionId || !project) return

  await handler({ project, sessionId, payload, workspaceFolders })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { handle }
