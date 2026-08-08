const fs = require('fs')
const path = require('path')
const vscode = require('vscode')

const { INSTALLED_HOOK } = require('./util/paths')
const { HOOK_SPEC, DECLINED_KEY } = require('./config')
const settings = require('./settings')

const MALFORMED_SETTINGS = (
  'Turn Diff: ~/.claude/settings.json is not valid JSON, so it was left untouched. ' +
  'Add the hooks manually — see the extension README.'
)

const MALFORMED_ON_REMOVE = 'Turn Diff: ~/.claude/settings.json is not valid JSON — nothing changed.'

const ALREADY_REGISTERED = 'Turn Diff: hooks are already registered.'

const REGISTERED = (
  'Turn Diff: hooks registered in ~/.claude/settings.json. Claude Code reads hooks at session ' +
  'start, so reload the window to activate them.'
)

const REMOVED = (
  'Turn Diff: hooks removed from ~/.claude/settings.json. The script at ' +
  '~/.claude/hooks/turn-diff.sh was left in place.'
)

const invitation = () => (
  `Turn Diff needs ${Object.keys(HOOK_SPEC).length} hooks in ~/.claude/settings.json to observe ` +
  'what Claude Code changes. Register them? A backup is written first.'
)

const writeFailed = (error) => `Turn Diff: could not write ~/.claude/settings.json — ${error.message}`

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const installHookScript = (context) => {
  const bundled = fs.readFileSync(path.join(context.extensionPath, 'hooks', 'turn-diff.sh'))

  let installed = null

  try {
    installed = fs.readFileSync(INSTALLED_HOOK)
  } catch {}

  if (installed && installed.equals(bundled)) return false

  fs.mkdirSync(path.dirname(INSTALLED_HOOK), { recursive: true })
  fs.writeFileSync(INSTALLED_HOOK, bundled, { mode: 0o755 })

  return true
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const registerHooks = async ({ interactive }) => {
  let current

  try {
    current = settings.readSettings()
  } catch {
    vscode.window.showErrorMessage(MALFORMED_SETTINGS)

    return false
  }

  if (settings.hooksRegistered(current)) {
    if (interactive) vscode.window.showInformationMessage(ALREADY_REGISTERED)

    return false
  }

  settings.applyHookSpec(current)

  try {
    settings.writeSettings(current)
  } catch (error) {
    vscode.window.showErrorMessage(writeFailed(error))

    return false
  }

  vscode.window.showInformationMessage(REGISTERED, 'Reload Window').then((choice) => {
    if (choice === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow')
  })

  return true
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const removeHooks = async () => {
  let current

  try {
    current = settings.readSettings()
  } catch {
    vscode.window.showErrorMessage(MALFORMED_ON_REMOVE)

    return
  }

  settings.stripOurHooks(current)

  try {
    settings.writeSettings(current)
  } catch (error) {
    vscode.window.showErrorMessage(writeFailed(error))

    return
  }

  vscode.window.showInformationMessage(REMOVED)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const promptToRegister = async (context) => {
  if (context.globalState.get(DECLINED_KEY)) return

  let current

  try {
    current = settings.readSettings()
  } catch {
    return
  }

  if (settings.hooksRegistered(current)) return

  const choice = await vscode.window.showInformationMessage(invitation(), 'Register', 'Not now', 'Never')

  if (choice === 'Register') {
    await registerHooks({ interactive: false })
  } else if (choice === 'Never') {
    await context.globalState.update(DECLINED_KEY, true)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const clearDeclined = (context) => context.globalState.update(DECLINED_KEY, false)

module.exports = { installHookScript, registerHooks, removeHooks, promptToRegister, clearDeclined }
