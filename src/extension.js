const fs = require('fs')
const path = require('path')
const vscode = require('vscode')

const view = require('./view')
const install = require('./install')
const { start: startServer } = require('./server')
const { projectDirFor } = require('./util/paths')

const activate = (context) => {
  const output = vscode.window.createOutputChannel('Turn Diff', { log: true })
  const log = (message) => output.error(message)

  view.markCurrentAsSeen() // a turn already on disk is not this window's news
  context.subscriptions.push(output, view.registerBeforeImageProvider())

  // Watch only this project's directory: the hook writes open.json there, and
  // the path has to be re-derived if the first workspace folder changes.
  let debounce = null
  let watcher = null
  const watchProject = () => {
    if (watcher) {
      watcher.close()
      watcher = null
    }
    const folders = view.workspaceFolders()
    if (!folders.length) return
    try {
      const directory = projectDirFor(folders[0])
      fs.mkdirSync(directory, { recursive: true })
      watcher = fs.watch(directory, (_event, filename) => {
        if (filename !== 'open.json') return
        clearTimeout(debounce)
        debounce = setTimeout(() => view.showLastTurn(), 60) // fs.watch fires twice per write
      })
    } catch (error) {
      log(`could not watch project directory: ${error.message}`)
    }
  }
  watchProject()

  // The hook is a thin client: it finds this window by project key and hands
  // the payload over, so the capture logic runs here rather than in a shell
  // script re-spawned before every tool call.
  const server = startServer(view.workspaceFolders, log)

  context.subscriptions.push(
    server,
    {
      dispose: () => {
        clearTimeout(debounce)
        if (watcher) watcher.close()
      },
    },
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      view.forgetLastRendered()
      watchProject()
      server.readvertise()
    }),
    vscode.commands.registerCommand('claudeTurnDiff.showLast', () =>
      view.showLastTurn({ force: true }),
    ),
    vscode.commands.registerCommand('claudeTurnDiff.installHooks', async () => {
      try {
        install.installHookScript(context)
      } catch (error) {
        vscode.window.showErrorMessage(
          `Turn Diff: could not install the hook script — ${error.message}`,
        )
        return
      }
      await install.clearDeclined(context)
      await install.registerHooks({ interactive: true })
    }),
    vscode.commands.registerCommand('claudeTurnDiff.uninstallHooks', install.removeHooks),
  )

  try {
    install.installHookScript(context)
  } catch (error) {
    log(`could not install the hook script: ${error.message}`)
  }
  void install.promptToRegister(context)
}

const deactivate = () => {}

module.exports = { activate, deactivate }
