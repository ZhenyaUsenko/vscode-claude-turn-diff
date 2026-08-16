import { HOOK_SPEC, HOOK_MARKER } from './config.js'
import { CLAUDE_DIR, SETTINGS_FILE } from './util/paths.js'
import fs from 'fs'

const isOurEntry = (entry) => typeof entry?.command === 'string' && entry.command.includes(HOOK_MARKER)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readSettings = () => {
  let rawSettings = ''

  try { rawSettings = fs.readFileSync(SETTINGS_FILE, 'utf8') } catch { return {} }

  if (!rawSettings.trim()) return {}

  return JSON.parse(rawSettings)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const writeSettings = (settings) => {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true })

  if (fs.existsSync(SETTINGS_FILE)) fs.copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.turn-diff-backup`)

  fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const hooksRegistered = (settings) => {
  return Object.entries(HOOK_SPEC).every(([event, groups]) => {
    const ourGroups = settings.hooks?.[event]?.filter((group) => group.hooks?.some(isOurEntry)) ?? []

    return JSON.stringify(ourGroups) === JSON.stringify(groups)
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const stripOurHooks = (settings) => {
  const hooks = settings.hooks

  if (!hooks) return settings

  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue

    hooks[event] = hooks[event].filter((group) => !group.hooks?.some(isOurEntry))

    if (!hooks[event].length) delete hooks[event]
  }

  if (!Object.keys(hooks).length) delete settings.hooks

  return settings
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const applyHookSpec = (settings) => {
  stripOurHooks(settings)

  settings.hooks ??= {}

  for (const [event, groups] of Object.entries(HOOK_SPEC)) {
    settings.hooks[event] = settings.hooks[event]?.concat(groups) ?? [...groups]
  }

  return settings
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { readSettings, writeSettings, hooksRegistered, stripOurHooks, applyHookSpec }
