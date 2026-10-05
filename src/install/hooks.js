import { INSTALLED_HOOK } from '../store/paths.js'
import { outputFile, readFile } from '../utils/files.js'
import { applyHookSpec, hooksMatchSpec, readSettings, stripOurHooks, writeSettings } from './settings.js'
import { DECLINED_KEY } from './spec.js'
import { join } from 'node:path'
import { commands, window } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const ALREADY_REGISTERED_MESSAGE = (
  'Turn Diff: hooks are already registered.'
)

const INVITATION_MESSAGE = (
  'Turn Diff needs to register hooks in ~/.claude/settings.json to observe ' +
  'what Claude Code changes. Register them? A backup is written first.'
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

const getReadError = (error) => `Turn Diff: could not read ~/.claude/settings.json — ${error.message}`

const getUpdateError = (error) => `Turn Diff: could not update ~/.claude/settings.json — ${error.message}`

const getScriptError = (error) => `Turn Diff: could not install the hook script — ${error.message}`

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const installHookScript = (context) => {
  try {
    const bundledScriptContents = readFile(join(context.extensionPath, 'hooks', 'turn-diff.sh'))

    if (readFile(INSTALLED_HOOK)?.equals(bundledScriptContents)) return

    outputFile(INSTALLED_HOOK, bundledScriptContents, { mode: 0o755 })
  } catch (error) {
    window.showErrorMessage(getScriptError(error))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const registerHooks = async () => {
  try {
    const currentSettings = readSettings()

    if (hooksMatchSpec(currentSettings)) return void window.showInformationMessage(ALREADY_REGISTERED_MESSAGE)

    applyHookSpec(currentSettings)
    writeSettings(currentSettings)

    const choice = await window.showInformationMessage(REGISTERED_MESSAGE, 'Reload Window')

    if (choice === 'Reload Window') commands.executeCommand('workbench.action.reloadWindow')
  } catch (error) {
    window.showErrorMessage(getUpdateError(error))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const removeHooks = () => {
  try {
    const currentSettings = readSettings()

    stripOurHooks(currentSettings)
    writeSettings(currentSettings)

    window.showInformationMessage(REMOVED_MESSAGE)
  } catch (error) {
    window.showErrorMessage(getUpdateError(error))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const promptToRegisterHooks = async (context) => {
  try {
    if (context.globalState.get(DECLINED_KEY)) return

    if (hooksMatchSpec(readSettings())) return

    const choice = await window.showInformationMessage(INVITATION_MESSAGE, 'Register', 'Not now', 'Never')

    if (choice === 'Register') return void registerHooks()

    if (choice === 'Never') return void context.globalState.update(DECLINED_KEY, true)
  } catch (error) {
    window.showErrorMessage(getReadError(error))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const setUpHooks = async (context) => {
  await context.globalState.update(DECLINED_KEY, false)

  installHookScript(context)
  registerHooks()
}
