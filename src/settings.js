const fs = require('fs')

const { CLAUDE_DIR, SETTINGS_FILE } = require('./util/paths')
const { HOOK_SPEC, HOOK_MARKER } = require('./config')

const isOurEntry = (entry) => typeof entry?.command === 'string' && entry.command.includes(HOOK_MARKER)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readSettings = () => {
  let raw = ''

  try {
    raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
  } catch {
    return {}
  }

  if (!raw.trim()) return {}

  return JSON.parse(raw)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const writeSettings = (settings) => {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true })

  if (fs.existsSync(SETTINGS_FILE)) fs.copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.turn-diff-backup`)

  fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hooksRegistered = (settings) => Object.entries(HOOK_SPEC).every(([event, groups]) => {
  const hooks = settings.hooks || {}
  const ours = (hooks[event] || []).filter((group) => (group.hooks || []).some(isOurEntry))

  return JSON.stringify(ours) === JSON.stringify(groups)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const stripOurHooks = (settings) => {
  const hooks = settings.hooks

  if (!hooks) return settings

  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue

    hooks[event] = hooks[event].filter((group) => !(group.hooks || []).some(isOurEntry))

    if (!hooks[event].length) delete hooks[event]
  }

  if (!Object.keys(hooks).length) delete settings.hooks

  return settings
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const applyHookSpec = (settings) => {
  stripOurHooks(settings)

  settings.hooks = settings.hooks || {}

  for (const [event, groups] of Object.entries(HOOK_SPEC)) {
    settings.hooks[event] = (settings.hooks[event] || []).concat(groups)
  }

  return settings
}

module.exports = { readSettings, writeSettings, hooksRegistered, stripOurHooks, applyHookSpec }
