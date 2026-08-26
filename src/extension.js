import { installHookScript, promptToRegisterHooks, removeHooks, setUpHooks } from './install/hooks.js'
import { startServer } from './server.js'
import { getProjectDir } from './store/paths.js'
import { disposeAllOutsideWatchers } from './utils/watch.js'
import { getCurrentProject } from './utils/workspace.js'
import { forgetLastRenderedTurn, markCurrentTurnAsSeen, registerBeforeImageProvider, showLastTurn } from './view.js'
import { mkdirSync, watch } from 'node:fs'
import { commands, window, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let manifestWatcher = null

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchManifest = (logError) => {
  try {
    const projectDir = getProjectDir(getCurrentProject())

    mkdirSync(projectDir, { recursive: true })

    manifestWatcher?.close()

    manifestWatcher = watch(projectDir, (_event, fileName) => { if (fileName === 'manifest.json') showLastTurn() })
  } catch (error) {
    logError(`could not watch project directory: ${error.message}`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const activate = (context) => {
  const outputChannel = window.createOutputChannel('Turn Diff', { log: true })

  const logError = (message) => outputChannel.error(message)

  markCurrentTurnAsSeen()
  watchManifest(logError)

  const server = startServer(logError)

  context.subscriptions.push(
    outputChannel,
    server,
    registerBeforeImageProvider(),
    { dispose: () => manifestWatcher?.close() },
    { dispose: () => disposeAllOutsideWatchers() },
    workspace.onDidChangeWorkspaceFolders(() => {
      forgetLastRenderedTurn()
      watchManifest(logError)
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

  promptToRegisterHooks(context)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const deactivate = () => {}
