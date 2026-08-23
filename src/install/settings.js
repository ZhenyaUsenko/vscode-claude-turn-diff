import { SETTINGS_FILE } from '../store/paths.js'
import { outputFile, readFile } from '../utils/files.js'
import { HOOK_SPEC, HOOK_MARKER } from './spec.js'
import { copyFileSync, existsSync } from 'node:fs'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isOurEntry = (entry) => {
  return typeof entry?.command === 'string' && entry.command.includes(HOOK_MARKER)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readSettings = () => {
  const rawSettings = readFile(SETTINGS_FILE, 'utf8')

  return rawSettings?.trim() ? JSON.parse(rawSettings) : {}
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const writeSettings = (settings) => {
  if (existsSync(SETTINGS_FILE)) copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.turn-diff-backup`)

  outputFile(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const hooksMatchSpec = (settings) => {
  return Object.entries(HOOK_SPEC).every(([event, groups]) => {
    const ourGroups = settings.hooks?.[event]?.filter((group) => group.hooks?.some(isOurEntry)) ?? []

    return JSON.stringify(ourGroups) === JSON.stringify(groups)
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const stripOurHooks = (settings) => {
  const hooks = settings.hooks

  if (!hooks) return

  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue

    hooks[event] = hooks[event].filter((group) => !group.hooks?.some(isOurEntry))

    if (!hooks[event].length) delete hooks[event]
  }

  if (!Object.keys(hooks).length) delete settings.hooks
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const applyHookSpec = (settings) => {
  stripOurHooks(settings)

  settings.hooks ??= {}

  for (const [event, groups] of Object.entries(HOOK_SPEC)) {
    settings.hooks[event] = settings.hooks[event]?.concat(groups) ?? [...groups]
  }
}
