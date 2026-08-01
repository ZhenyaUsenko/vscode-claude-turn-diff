const vscode = require('vscode')
const fs = require('fs')
const path = require('path')
const os = require('os')

// The Stop hook writes this manifest, we turn it into a multi-file diff
// editor. Shape:
//   { root, title, ts, files: [[resourceAbs, beforeAbs, currentAbs, status], ...] }
// status is "A" | "M" | "D".
const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const DIR = path.join(CLAUDE_DIR, 'turn-diff')
const MANIFEST = path.join(DIR, '_open.json')
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json')
const HOOK_DEST = path.join(CLAUDE_DIR, 'hooks', 'turn-diff.sh')

// The multi-diff editor decides a file was RENAMED by comparing
// originalUri.path !== modifiedUri.path. Pointing `original` straight at the
// before-image on disk therefore struck through every filename and stamped it
// "R". Instead we serve the before-image through a virtual scheme that keeps
// the real path verbatim, so only the scheme differs.
const SCHEME = 'claude-before'

const HOOK_CMD = '"$HOME"/.claude/hooks/turn-diff.sh'
const HOOK_SPEC = {
  UserPromptSubmit: [{ hooks: [{ type: 'command', command: `${HOOK_CMD} begin`, timeout: 10 }] }],
  PreToolUse: [
    {
      matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash',
      hooks: [{ type: 'command', command: `${HOOK_CMD} arm`, timeout: 15 }],
    },
  ],
  Stop: [{ hooks: [{ type: 'command', command: `${HOOK_CMD} end`, timeout: 30 }] }],
}
const DECLINED_KEY = 'claudeTurnDiff.declinedHookInstall'

const beforeByPath = new Map()
const onDidChangeEmitter = new vscode.EventEmitter()

let lastTs = 0

function read() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  } catch {
    return null
  }
}

// Only the window whose workspace produced the turn should react. An exact
// match on the root is wrong: the root is a working directory, and a workspace
// folder can sit above it, below it, or be one of several. What actually
// matters is whether this window can show these files — with the root as a
// fallback for turns that only touched paths outside every folder.
function isForThisWindow(m, folders) {
  if (!folders || folders.length === 0) return true
  const under = (child, parent) => child === parent || child.startsWith(parent + path.sep)
  if (m.files.some(([resource]) => folders.some((f) => under(resource, f)))) return true
  return !!m.root && folders.some((f) => under(f, m.root) || under(m.root, f))
}

function sameBytes(a, b) {
  try {
    if (fs.statSync(a).size !== fs.statSync(b).size) return false
    return fs.readFileSync(a).equals(fs.readFileSync(b))
  } catch {
    return false
  }
}

async function show(force) {
  const m = read()
  if (!m || !Array.isArray(m.files) || m.files.length === 0) return
  if (!force && m.ts === lastTs) return

  const folders = (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath)
  if (!isForThisWindow(m, folders)) return

  lastTs = m.ts

  const resources = []
  for (const entry of m.files) {
    const [resource, before, , status] = entry

    // The status was frozen when the manifest was written; the tree may have
    // moved on since. Drop entries that no longer represent a change, so a
    // replay after reverting doesn't open whole unchanged files with nothing
    // folded away.
    const exists = fs.existsSync(resource)
    if (status === 'A') {
      if (!exists) continue // added, then deleted again
    } else if (exists && sameBytes(before, resource)) {
      continue // reverted by hand, or a deleted file restored as-is
    }

    const fileUri = vscode.Uri.file(resource)
    const beforeUri = fileUri.with({ scheme: SCHEME })

    beforeByPath.set(fileUri.path, before)
    onDidChangeEmitter.fire(beforeUri) // drop any content cached from a prior turn

    if (status === 'A') resources.push([fileUri, undefined, fileUri])
    else if (status === 'D') resources.push([fileUri, beforeUri, undefined])
    else resources.push([fileUri, beforeUri, fileUri])
  }

  const title = m.title || 'Last turn changes'

  if (resources.length === 0) {
    if (force) await vscode.commands.executeCommand('vscode.changes', title, [])
    return
  }

  try {
    await vscode.commands.executeCommand('vscode.changes', title, resources)
  } catch {
    // defensive: if the undefined slots used for A/D are ever rejected, fall
    // back to treating everything as a plain modification
    const safe = resources.map(([r]) => [r, r.with({ scheme: SCHEME }), r])
    await vscode.commands.executeCommand('vscode.changes', title, safe)
  }
}

// --- installation ----------------------------------------------------------
// The extension is only half the product: the hook is what actually observes
// the turn. Ship it here and keep the copy in ~/.claude/hooks in step, so the
// two halves can never drift across an upgrade.

function installHookScript(context) {
  const src = path.join(context.extensionPath, 'hooks', 'turn-diff.sh')
  const bundled = fs.readFileSync(src)
  let current = null
  try {
    current = fs.readFileSync(HOOK_DEST)
  } catch {}
  if (current && current.equals(bundled)) return false
  fs.mkdirSync(path.dirname(HOOK_DEST), { recursive: true })
  fs.writeFileSync(HOOK_DEST, bundled, { mode: 0o755 })
  return true
}

function isOurs(entry) {
  return typeof entry?.command === 'string' && entry.command.includes('turn-diff.sh')
}

function hooksRegistered(settings) {
  const h = settings.hooks || {}
  return Object.keys(HOOK_SPEC).every((evt) =>
    (h[evt] || []).some((group) => (group.hooks || []).some(isOurs)),
  )
}

function readSettings() {
  let raw = ''
  try {
    raw = fs.readFileSync(SETTINGS, 'utf8')
  } catch {
    return {}
  }
  if (!raw.trim()) return {}
  return JSON.parse(raw) // caller handles the throw
}

function writeSettings(settings) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true })
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, `${SETTINGS}.turn-diff-backup`)
  fs.writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`)
}

function stripOurHooks(settings) {
  const h = settings.hooks
  if (!h) return settings
  for (const evt of Object.keys(h)) {
    if (!Array.isArray(h[evt])) continue
    h[evt] = h[evt].filter((group) => !(group.hooks || []).some(isOurs))
    if (h[evt].length === 0) delete h[evt]
  }
  if (Object.keys(h).length === 0) delete settings.hooks
  return settings
}

async function registerHooks({ interactive }) {
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
    if (interactive) vscode.window.showInformationMessage('Turn Diff: hooks are already registered.')
    return false
  }

  stripOurHooks(settings)
  settings.hooks = settings.hooks || {}
  for (const [evt, groups] of Object.entries(HOOK_SPEC)) {
    settings.hooks[evt] = (settings.hooks[evt] || []).concat(groups)
  }

  try {
    writeSettings(settings)
  } catch (err) {
    vscode.window.showErrorMessage(`Turn Diff: could not write ~/.claude/settings.json — ${err.message}`)
    return false
  }

  vscode.window.showInformationMessage(
    'Turn Diff: hooks registered in ~/.claude/settings.json. Claude Code reads hooks at session start, so reload the window to activate them.',
    'Reload Window',
  ).then((pick) => {
    if (pick === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow')
  })
  return true
}

async function promptToRegister(context) {
  if (context.globalState.get(DECLINED_KEY)) return
  let settings
  try {
    settings = readSettings()
  } catch {
    return // malformed settings: say nothing on startup, the command reports it
  }
  if (hooksRegistered(settings)) return

  const pick = await vscode.window.showInformationMessage(
    'Turn Diff needs three hooks in ~/.claude/settings.json to observe what Claude Code changes. Register them? A backup is written first.',
    'Register',
    'Not now',
    'Never',
  )
  if (pick === 'Register') await registerHooks({ interactive: false })
  else if (pick === 'Never') await context.globalState.update(DECLINED_KEY, true)
}

function activate(context) {
  // don't replay the previous session's turn on startup
  const existing = read()
  if (existing && existing.ts) lastTs = existing.ts

  try {
    fs.mkdirSync(DIR, { recursive: true })
  } catch {}

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
      onDidChange: onDidChangeEmitter.event,
      provideTextDocumentContent(uri) {
        const src = beforeByPath.get(uri.path)
        if (!src) return ''
        try {
          return fs.readFileSync(src, 'utf8')
        } catch {
          return ''
        }
      },
    }),
  )

  let pending = null
  const watcher = fs.watch(DIR, (_event, filename) => {
    if (filename !== '_open.json') return
    clearTimeout(pending)
    pending = setTimeout(() => show(false), 60) // debounce: fs.watch fires twice on write
  })

  context.subscriptions.push({
    dispose: () => {
      clearTimeout(pending)
      watcher.close()
      onDidChangeEmitter.dispose()
    },
  })

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTurnDiff.showLast', () => show(true)),
    vscode.commands.registerCommand('claudeTurnDiff.installHooks', async () => {
      try {
        installHookScript(context)
      } catch (err) {
        vscode.window.showErrorMessage(`Turn Diff: could not install the hook script — ${err.message}`)
        return
      }
      await context.globalState.update(DECLINED_KEY, false)
      await registerHooks({ interactive: true })
    }),
    vscode.commands.registerCommand('claudeTurnDiff.uninstallHooks', async () => {
      let settings
      try {
        settings = readSettings()
      } catch {
        vscode.window.showErrorMessage('Turn Diff: ~/.claude/settings.json is not valid JSON — nothing changed.')
        return
      }
      stripOurHooks(settings)
      try {
        writeSettings(settings)
      } catch (err) {
        vscode.window.showErrorMessage(`Turn Diff: could not write ~/.claude/settings.json — ${err.message}`)
        return
      }
      vscode.window.showInformationMessage(
        'Turn Diff: hooks removed from ~/.claude/settings.json. The script at ~/.claude/hooks/turn-diff.sh was left in place.',
      )
    }),
  )

  // Keep the bundled hook and the installed copy in step, silently — it is our
  // own file. Registering hooks touches the user's config, so that asks first.
  try {
    installHookScript(context)
  } catch {}
  void promptToRegister(context)
}

function deactivate() {}

module.exports = { activate, deactivate }
