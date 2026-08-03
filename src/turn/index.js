const { begin, cleanPrompt } = require('./begin')
const { arm } = require('./arm')
const { end } = require('./end')

const HANDLERS = { begin, arm, end }

// Entry point for everything the hook sends. `workingDir` is the hook's cwd,
// which is also what the project key derives from.
const handle = async (mode, workingDir, payload, workspaceFolders) => {
  const handler = HANDLERS[mode]
  const sessionId = payload && payload.session_id
  if (!handler || !sessionId || !workingDir) return
  await handler({ workingDir, sessionId, payload, workspaceFolders: workspaceFolders || [] })
}

module.exports = { handle, cleanPrompt }
