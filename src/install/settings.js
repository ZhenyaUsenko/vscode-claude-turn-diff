import { SETTINGS_FILE } from '../store/paths.js'
import { outputFile, readFile } from '../utils/files.js'
import { HOOK_SPEC, HOOK_MARKER } from './spec.js'
import { copyFileSync, existsSync } from 'node:fs'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readSettings = () => {
  const settingsContents = readFile(SETTINGS_FILE, 'utf8')

  return settingsContents?.trim() ? JSON.parse(settingsContents) : {}
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const writeSettings = (settings) => {
  if (existsSync(SETTINGS_FILE)) copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.turn-diff-backup`)

  outputFile(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const hooksMatchSpec = (settings) => {
  for (const event in { ...settings.hooks, ...HOOK_SPEC }) {
    const groups = settings.hooks?.[event]

    const ourGroups = groups?.filter((group) => group.hooks.some((hook) => hook.command?.includes(HOOK_MARKER)))

    if (JSON.stringify(ourGroups ?? []) !== JSON.stringify(HOOK_SPEC[event] ?? [])) return false
  }

  return true
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const stripOurHooks = (settings) => {
  for (const event in settings.hooks) {
    const groups = settings.hooks[event]

    const updatedGroups = groups.flatMap((group) => {
      const otherHooks = group.hooks.filter((hook) => !hook.command?.includes(HOOK_MARKER))

      return otherHooks.length ? [{ ...group, hooks: otherHooks }] : []
    })

    settings.hooks[event] = updatedGroups.length ? updatedGroups : undefined
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const applyHookSpec = (settings) => {
  stripOurHooks(settings)

  settings.hooks ??= {}

  for (const event in HOOK_SPEC) {
    settings.hooks[event] ??= []

    settings.hooks[event].push(...HOOK_SPEC[event])
  }
}
