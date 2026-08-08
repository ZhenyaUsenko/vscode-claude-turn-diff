const { begin } = require('./begin')
const { arm } = require('./arm')
const { end } = require('./end')

const HANDLERS = { begin, arm, end }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const handle = async (mode, project, payload, workspaceFolders) => {
  const handler = HANDLERS[mode]
  const sessionId = payload && payload.session_id

  if (!handler || !sessionId || !project) return

  await handler({ project, sessionId, payload, workspaceFolders })
}

module.exports = { handle }
