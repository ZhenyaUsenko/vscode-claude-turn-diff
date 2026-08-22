import { INSTALLED_HOOK } from '../store/paths.js'
import { applyHookSpec, hooksMatchSpec, readSettings, stripOurHooks, writeSettings } from './settings.js'
import { HOOK_SPEC, DECLINED_KEY } from './spec.js'
import fs from 'fs'
import path from 'path'
import * as vscode from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

const showVscodeInfo = (...args) => vscode.window.showInformationMessage(...args)

const showVscodeError = (...args) => vscode.window.showErrorMessage(...args)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const installHookScript = (context) => {
  let installedScript

  const bundledScript = fs.readFileSync(path.join(context.extensionPath, 'hooks', 'turn-diff.sh'))

  try { installedScript = fs.readFileSync(INSTALLED_HOOK) } catch {}

  if (installedScript?.equals(bundledScript)) return

  fs.mkdirSync(path.dirname(INSTALLED_HOOK), { recursive: true })

  fs.writeFileSync(INSTALLED_HOOK, bundledScript, { mode: 0o755 })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const registerHooks = async () => {
  let currentSettings

  try { currentSettings = readSettings() } catch { return void showVscodeError(MALFORMED_ON_REGISTER_ERROR) }

  if (hooksMatchSpec(currentSettings)) return void showVscodeInfo(ALREADY_REGISTERED_MESSAGE)

  applyHookSpec(currentSettings)

  try { writeSettings(currentSettings) } catch (error) { return void showVscodeError(getWriteError(error)) }

  const choice = await showVscodeInfo(REGISTERED_MESSAGE, 'Reload Window')

  if (choice === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const removeHooks = () => {
  let currentSettings

  try { currentSettings = readSettings() } catch { return void showVscodeError(MALFORMED_ON_REMOVE_ERROR) }

  stripOurHooks(currentSettings)

  try { writeSettings(currentSettings) } catch (error) { return void showVscodeError(getWriteError(error)) }

  showVscodeInfo(REMOVED_MESSAGE)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const promptToRegisterHooks = async (context) => {
  let currentSettings

  if (context.globalState.get(DECLINED_KEY)) return

  try { currentSettings = readSettings() } catch { return }

  if (hooksMatchSpec(currentSettings)) return

  const choice = await showVscodeInfo(getInvitationMessage(), 'Register', 'Not now', 'Never')

  if (choice === 'Register') return void registerHooks()

  if (choice === 'Never') return void context.globalState.update(DECLINED_KEY, true)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const setUpHooks = async (context) => {
  try { installHookScript(context) } catch (error) { return void showVscodeError(getScriptError(error)) }

  await context.globalState.update(DECLINED_KEY, false)

  registerHooks()
}
