import { INSTALLED_HOOK } from '../utils/paths.js'
import { applyHookSpec, hooksMatchSpec, readSettings, stripOurHooks, writeSettings } from './settings.js'
import { HOOK_SPEC, DECLINED_KEY } from './spec.js'
import fs from 'fs'
import path from 'path'
import * as vscode from 'vscode'

const MALFORMED_ON_REGISTER_ERROR = (
  'Turn Diff: ~/.claude/settings.json is not valid JSON, so it was left untouched. ' +
  'Add the hooks manually — see the extension README.'
)

const MALFORMED_ON_REMOVE_ERROR = (
  'Turn Diff: ~/.claude/settings.json is not valid JSON — nothing changed.'
)

const ALREADY_REGISTERED_MESSAGE = (
  'Turn Diff: hooks are already registered.'
)

const REGISTERED_MESSAGE = (
  'Turn Diff: hooks registered in ~/.claude/settings.json. Claude Code reads hooks at session ' +
  'start, so reload the window to activate them.'
)

const REMOVED_MESSAGE = (
  'Turn Diff: hooks removed from ~/.claude/settings.json. The script at ' +
  '~/.claude/hooks/turn-diff.sh was left in place.'
)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getInvitationMessage = () => (
  `Turn Diff needs ${Object.keys(HOOK_SPEC).length} hooks in ~/.claude/settings.json to observe ` +
  'what Claude Code changes. Register them? A backup is written first.'
)

const getWriteError = (error) => (
  `Turn Diff: could not write ~/.claude/settings.json — ${error.message}`
)

const getScriptError = (error) => (
  `Turn Diff: could not install the hook script — ${error.message}`
)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const installHookScript = (context) => {
  const bundledScript = fs.readFileSync(path.join(context.extensionPath, 'hooks', 'turn-diff.sh'))

  let installedScript = null

  try { installedScript = fs.readFileSync(INSTALLED_HOOK) } catch {}

  if (installedScript && installedScript.equals(bundledScript)) return false

  fs.mkdirSync(path.dirname(INSTALLED_HOOK), { recursive: true })
  fs.writeFileSync(INSTALLED_HOOK, bundledScript, { mode: 0o755 })

  return true
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const registerHooks = async (params) => {
  let currentSettings

  try {
    currentSettings = readSettings()
  } catch {
    vscode.window.showErrorMessage(MALFORMED_ON_REGISTER_ERROR)

    return false
  }

  if (hooksMatchSpec(currentSettings)) {
    if (params.interactive) vscode.window.showInformationMessage(ALREADY_REGISTERED_MESSAGE)

    return false
  }

  applyHookSpec(currentSettings)

  try {
    writeSettings(currentSettings)
  } catch (error) {
    vscode.window.showErrorMessage(getWriteError(error))

    return false
  }

  vscode.window.showInformationMessage(REGISTERED_MESSAGE, 'Reload Window').then((choice) => {
    if (choice === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow')
  })

  return true
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const removeHooks = async () => {
  let currentSettings

  try {
    currentSettings = readSettings()
  } catch {
    vscode.window.showErrorMessage(MALFORMED_ON_REMOVE_ERROR)

    return
  }

  stripOurHooks(currentSettings)

  try {
    writeSettings(currentSettings)
  } catch (error) {
    vscode.window.showErrorMessage(getWriteError(error))

    return
  }

  vscode.window.showInformationMessage(REMOVED_MESSAGE)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const promptToRegisterHooks = async (context) => {
  if (context.globalState.get(DECLINED_KEY)) return

  let currentSettings

  try { currentSettings = readSettings() } catch { return }

  if (hooksMatchSpec(currentSettings)) return

  const choice = await vscode.window.showInformationMessage(getInvitationMessage(), 'Register', 'Not now', 'Never')

  if (choice === 'Register') {
    await registerHooks({ interactive: false })
  } else if (choice === 'Never') {
    await context.globalState.update(DECLINED_KEY, true)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const clearDeclinedFlag = (context) => {
  return context.globalState.update(DECLINED_KEY, false)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const setUpHooks = async (context) => {
  try {
    installHookScript(context)
  } catch (error) {
    vscode.window.showErrorMessage(getScriptError(error))

    return
  }

  await clearDeclinedFlag(context)
  await registerHooks({ interactive: true })
}
