const install = require('./install')
const server = require('./server')
const { projectKey, projectDirFor } = require('./util/paths')
const { getWorkspaceFolders } = require('./util/workspace')
const view = require('./view')
const { disposeAllWatchers } = require('./watch')
const fs = require('fs')
const vscode = require('vscode')

const WATCH_DEBOUNCE_MS = 60

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchProject = (watchState) => {
  const workspaceFolders = getWorkspaceFolders()

  if (!workspaceFolders.length) return null

  try {
    const projectDir = projectDirFor(projectKey(workspaceFolders[0]))

    fs.mkdirSync(projectDir, { recursive: true })

    return fs.watch(projectDir, (_event, filename) => {
      if (filename !== 'open.json') return

      clearTimeout(watchState.debounceTimer)

      watchState.debounceTimer = setTimeout(() => view.showLastTurn(), WATCH_DEBOUNCE_MS)
    })
  } catch (error) {
    watchState.logError(`could not watch project directory: ${error.message}`)

    return null
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const rewatchProject = (watchState) => {
  if (watchState.projectWatcher) watchState.projectWatcher.close()

  watchState.projectWatcher = watchProject(watchState)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const disposeWatch = (watchState) => {
  clearTimeout(watchState.debounceTimer)

  if (watchState.projectWatcher) watchState.projectWatcher.close()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const createManifestWatch = (logError) => {
  const watchState = { logError, debounceTimer: null, projectWatcher: null }

  return { rewatch: () => rewatchProject(watchState), dispose: () => disposeWatch(watchState) }
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
  const outputChannel = vscode.window.createOutputChannel('Turn Diff', { log: true })

  const logError = (message) => outputChannel.error(message)

  const manifestWatch = createManifestWatch(logError)

  view.markCurrentAsSeen()
  manifestWatch.rewatch()

  const hookServer = server.start(logError)

  context.subscriptions.push(
    outputChannel,
    hookServer,
    manifestWatch,
    view.registerBeforeImageProvider(),
    { dispose: disposeAllWatchers },
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      view.forgetLastRendered()
      manifestWatch.rewatch()
      hookServer.readvertise()
    }),
    vscode.commands.registerCommand('claudeTurnDiff.showLast', () => view.showLastTurn({ force: true })),
    vscode.commands.registerCommand('claudeTurnDiff.installHooks', () => registerHooksCommand(context)),
    vscode.commands.registerCommand('claudeTurnDiff.uninstallHooks', install.removeHooks),
  )

  try {
    install.installHookScript(context)
  } catch (error) {
    logError(`could not install the hook script: ${error.message}`)
  }

  void install.promptToRegister(context)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const deactivate = () => {}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = { activate, deactivate }
