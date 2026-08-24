import { installHookScript, promptToRegisterHooks, removeHooks, setUpHooks } from './install/hooks.js'
import { startServer } from './server.js'
import { getProjectKey, getProjectDir } from './store/paths.js'
import { disposeAllWatchers } from './utils/watch.js'
import { getWorkspaceDirs } from './utils/workspace.js'
import { forgetLastRenderedTurn, markCurrentTurnAsSeen, registerBeforeImageProvider, showLastTurn } from './view.js'
import { mkdirSync, watch } from 'node:fs'
import { commands, window, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const WATCH_DEBOUNCE_MS = 60

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchProject = (watchState) => {
  const workspaceDirs = getWorkspaceDirs()

  if (!workspaceDirs.length) return null

  try {
    const projectDir = getProjectDir(getProjectKey(workspaceDirs[0]))

    mkdirSync(projectDir, { recursive: true })

    return watch(projectDir, (_event, fileName) => {
      if (fileName !== 'open.json') return

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

export const activate = (context) => {
  const outputChannel = window.createOutputChannel('Turn Diff', { log: true })

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
    workspace.onDidChangeWorkspaceFolders(() => {
      forgetLastRenderedTurn()
      manifestWatch.rewatch()
      server.readvertise()
    }),
    commands.registerCommand('claudeTurnDiff.showLast', () => showLastTurn({ force: true })),
    commands.registerCommand('claudeTurnDiff.installHooks', () => setUpHooks(context)),
    commands.registerCommand('claudeTurnDiff.uninstallHooks', removeHooks),
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
