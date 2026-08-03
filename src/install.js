// The extension is only half the product: the hook is what Claude Code
// actually runs. Ship it here, keep the installed copy in step on every
// upgrade, and offer to register the hooks in the user's settings.

const fs = require('fs')
const path = require('path')
const vscode = require('vscode')

const { CLAUDE_DIR, SETTINGS_FILE, INSTALLED_HOOK } = require('./util/paths')
const { HOOK_SPEC, HOOK_MARKER, DECLINED_KEY } = require('./config')

// Written silently — it is our own file, and letting it drift from the
// extension would break the pair.
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

const isOurEntry = (entry) =>
  typeof entry?.command === 'string' && entry.command.includes(HOOK_MARKER)

const hooksRegistered = (settings) => {
  const hooks = settings.hooks || {}
  return Object.keys(HOOK_SPEC).every((event) =>
    (hooks[event] || []).some((group) => (group.hooks || []).some(isOurEntry)),
  )
}

const readSettings = () => {
  let raw = ''
  try {
    raw = fs.readFileSync(SETTINGS_FILE, 'utf8')
  } catch {
    return {}
  }
  if (!raw.trim()) return {}
  return JSON.parse(raw) // caller handles the throw
}

const writeSettings = (settings) => {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  if (fs.existsSync(SETTINGS_FILE)) {
    fs.copyFileSync(SETTINGS_FILE, `${SETTINGS_FILE}.turn-diff-backup`)
  }
  fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`)
}

// Removes only our own entries; everything else in the file is left alone.
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

const registerHooks = async ({ interactive }) => {
  let settings
  try {
    settings = readSettings()
  } catch {
    vscode.window.showErrorMessage(
      'Turn Diff: ~/.claude/settings.json is not valid JSON, so it was left untouched. Add the hooks manually — see the extension README.',
    )
    return false
  }

  if (hooksRegistered(settings)) {
    if (interactive) {
      vscode.window.showInformationMessage('Turn Diff: hooks are already registered.')
    }
    return false
  }

  stripOurHooks(settings)
  settings.hooks = settings.hooks || {}
  for (const [event, groups] of Object.entries(HOOK_SPEC)) {
    settings.hooks[event] = (settings.hooks[event] || []).concat(groups)
  }

  try {
    writeSettings(settings)
  } catch (error) {
    vscode.window.showErrorMessage(
      `Turn Diff: could not write ~/.claude/settings.json — ${error.message}`,
    )
    return false
  }

  vscode.window
    .showInformationMessage(
      'Turn Diff: hooks registered in ~/.claude/settings.json. Claude Code reads hooks at session start, so reload the window to activate them.',
      'Reload Window',
    )
    .then((choice) => {
      if (choice === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow')
    })
  return true
}

const removeHooks = async () => {
  let settings
  try {
    settings = readSettings()
  } catch {
    vscode.window.showErrorMessage(
      'Turn Diff: ~/.claude/settings.json is not valid JSON — nothing changed.',
    )
    return
  }
  stripOurHooks(settings)
  try {
    writeSettings(settings)
  } catch (error) {
    vscode.window.showErrorMessage(
      `Turn Diff: could not write ~/.claude/settings.json — ${error.message}`,
    )
    return
  }
  vscode.window.showInformationMessage(
    'Turn Diff: hooks removed from ~/.claude/settings.json. The script at ~/.claude/hooks/turn-diff.sh was left in place.',
  )
}

const promptToRegister = async (context) => {
  if (context.globalState.get(DECLINED_KEY)) return

  let settings
  try {
    settings = readSettings()
  } catch {
    return // malformed settings: stay quiet on startup, the command reports it
  }
  if (hooksRegistered(settings)) return

  const choice = await vscode.window.showInformationMessage(
    'Turn Diff needs three hooks in ~/.claude/settings.json to observe what Claude Code changes. Register them? A backup is written first.',
    'Register',
    'Not now',
    'Never',
  )
  if (choice === 'Register') await registerHooks({ interactive: false })
  else if (choice === 'Never') await context.globalState.update(DECLINED_KEY, true)
}

const clearDeclined = (context) => context.globalState.update(DECLINED_KEY, false)

module.exports = {
  installHookScript,
  registerHooks,
  removeHooks,
  promptToRegister,
  clearDeclined,
}
