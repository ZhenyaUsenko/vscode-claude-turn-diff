import { installHookScript, promptToRegisterHooks, removeHooks, setUpHooks } from './install/hooks.js'
import { startServer } from './server.js'
import { releaseOutsideWatchers } from './utils/watch.js'
import { registerBeforeImageProvider, showLastTurn } from './view.js'
import { commands, window, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const activate = (context) => {
  const outputChannel = window.createOutputChannel('Turn Diff', { log: true })

  const logError = (message) => outputChannel.error(message)

  const onPublish = () => showLastTurn().catch((error) => logError(`could not open the diff: ${error.stack}`))

  const server = startServer(logError, onPublish)

  context.subscriptions.push(
    outputChannel,
    server,
    { dispose: releaseOutsideWatchers },
    registerBeforeImageProvider(),
    window.onDidChangeWindowState((windowState) => { if (windowState.focused) server.readvertise() }),
    workspace.onDidChangeWorkspaceFolders(() => server.readvertise()),
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
