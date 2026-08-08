const path = require('path')
const vscode = require('vscode')

const { isUnder, canonical } = require('./util/files')

const bySession = new Map()

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchersFor = (sessionId) => {
  let watchers = bySession.get(sessionId)

  if (!watchers) {
    watchers = new Map()

    bySession.set(sessionId, watchers)
  }

  return watchers
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchOutsideWorkspace = (targets, workspaceFolders, sessionId) => {
  const roots = workspaceFolders.map(canonical)
  const watchers = watchersFor(sessionId)

  for (const target of targets) {
    if (watchers.has(target)) continue
    if (roots.some((root) => isUnder(canonical(target), root))) continue

    const directory = vscode.Uri.file(path.dirname(target))
    const pattern = new vscode.RelativePattern(directory, path.basename(target))

    watchers.set(target, vscode.workspace.createFileSystemWatcher(pattern))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const disposeWatchers = (sessionId) => {
  const watchers = bySession.get(sessionId)

  if (!watchers) return

  watchers.forEach((watcher) => watcher.dispose())
  bySession.delete(sessionId)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const disposeAllWatchers = () => {
  bySession.forEach((watchers) => watchers.forEach((watcher) => watcher.dispose()))
  bySession.clear()
}

module.exports = { watchOutsideWorkspace, disposeWatchers, disposeAllWatchers }
