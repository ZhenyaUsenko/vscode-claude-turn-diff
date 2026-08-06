const { begin } = require('./begin')
const { arm } = require('./arm')
const { end } = require('./end')

const HANDLERS = { begin, arm, end }

// Entry point for everything the hook sends. `project` is Claude Code's own key
// for the session, taken from the transcript path rather than from a cwd that
// moves whenever Claude runs `cd`.
const handle = async (mode, project, payload, workspaceFolders) => {
  const handler = HANDLERS[mode]
  const sessionId = payload && payload.session_id
  if (!handler || !sessionId || !project) return
  await handler({ project, sessionId, payload, workspaceFolders })
}

module.exports = { handle }
