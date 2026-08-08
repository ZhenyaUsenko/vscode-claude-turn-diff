const fs = require('fs')
const vscode = require('vscode')

const view = require('./view')
const install = require('./install')
const { start: startServer } = require('./server')
const { disposeAllWatchers } = require('./watch')
const { projectKey, projectDirFor } = require('./util/paths')

const WATCH_DEBOUNCE_MS = 60

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchProject = (log, onManifestChanged) => {
  const folders = view.workspaceFolders()

  if (!folders.length) return null

  try {
    const directory = projectDirFor(projectKey(folders[0]))

    fs.mkdirSync(directory, { recursive: true })

    return fs.watch(directory, (_event, filename) => {
      if (filename === 'open.json') onManifestChanged()
    })
  } catch (error) {
    log(`could not watch project directory: ${error.message}`)

    return null
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const createManifestWatch = (log) => {
  let debounce = null
  let watcher = null

  const onManifestChanged = () => {
    clearTimeout(debounce)

    debounce = setTimeout(() => view.showLastTurn(), WATCH_DEBOUNCE_MS)
  }

  const rewatch = () => {
    if (watcher) watcher.close()

    watcher = watchProject(log, onManifestChanged)
  }

  const dispose = () => {
    clearTimeout(debounce)

    if (watcher) watcher.close()
  }

  return { rewatch, dispose }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const registerHooksCommand = async (context) => {
  try {
    install.installHookScript(context)
  } catch (error) {
    vscode.window.showErrorMessage(`Turn Diff: could not install the hook script — ${error.message}`)

    return
  }

  await install.clearDeclined(context)
  await install.registerHooks({ interactive: true })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const activate = (context) => {
  const output = vscode.window.createOutputChannel('Turn Diff', { log: true })
  const log = (message) => output.error(message)
  const watch = createManifestWatch(log)

  view.markCurrentAsSeen()
  watch.rewatch()

  const server = startServer(view.workspaceFolders, log)

  context.subscriptions.push(
    output,
    server,
    watch,
    view.registerBeforeImageProvider(),
    { dispose: disposeAllWatchers },
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      view.forgetLastRendered()
      watch.rewatch()
      server.readvertise()
    }),
    vscode.commands.registerCommand('claudeTurnDiff.showLast', () => view.showLastTurn({ force: true })),
    vscode.commands.registerCommand('claudeTurnDiff.installHooks', () => registerHooksCommand(context)),
    vscode.commands.registerCommand('claudeTurnDiff.uninstallHooks', install.removeHooks),
  )

  try {
    install.installHookScript(context)
  } catch (error) {
    log(`could not install the hook script: ${error.message}`)
  }

  void install.promptToRegister(context)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const deactivate = () => {}

module.exports = { activate, deactivate }
