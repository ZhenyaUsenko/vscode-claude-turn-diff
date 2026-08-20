import { clearDeclinedFlag, installHookScript, promptToRegisterHooks, registerHooks, removeHooks } from './install.js'
import { startServer } from './server.js'
import { getProjectKey, getProjectDir } from './util/paths.js'
import { getWorkspaceFolders } from './util/workspace.js'
import { forgetLastRenderedTurn, markCurrentTurnAsSeen, registerBeforeImageProvider, showLastTurn } from './view.js'
import { disposeAllWatchers } from './watch.js'
import fs from 'fs'
import * as vscode from 'vscode'

const WATCH_DEBOUNCE_MS = 60

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchProject = (watchState) => {
  const workspaceFolders = getWorkspaceFolders()

  if (!workspaceFolders.length) return null

  try {
    const projectDir = getProjectDir(getProjectKey(workspaceFolders[0]))

    fs.mkdirSync(projectDir, { recursive: true })

    return fs.watch(projectDir, (_event, filename) => {
      if (filename !== 'open.json') return

      clearTimeout(watchState.debounceTimer)

      watchState.debounceTimer = setTimeout(() => showLastTurn(), WATCH_DEBOUNCE_MS)
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
    installHookScript(context)
  } catch (error) {
    vscode.window.showErrorMessage(`Turn Diff: could not install the hook script — ${error.message}`)

    return
  }

  await clearDeclinedFlag(context)
  await registerHooks({ interactive: true })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const activate = (context) => {
  const outputChannel = vscode.window.createOutputChannel('Turn Diff', { log: true })

  const logError = (message) => outputChannel.error(message)

  const manifestWatch = createManifestWatch(logError)

  markCurrentTurnAsSeen()
  manifestWatch.rewatch()

  const server = startServer(logError)

  context.subscriptions.push(
    outputChannel,
    server,
    manifestWatch,
    registerBeforeImageProvider(),
    { dispose: disposeAllWatchers },
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      forgetLastRenderedTurn()
      manifestWatch.rewatch()
      server.readvertise()
    }),
    vscode.commands.registerCommand('claudeTurnDiff.showLast', () => showLastTurn({ force: true })),
    vscode.commands.registerCommand('claudeTurnDiff.installHooks', () => registerHooksCommand(context)),
    vscode.commands.registerCommand('claudeTurnDiff.uninstallHooks', removeHooks),
  )

  try {
    installHookScript(context)
  } catch (error) {
    logError(`could not install the hook script: ${error.message}`)
  }

  void promptToRegisterHooks(context)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const deactivate = () => {}
