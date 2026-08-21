import { isUnder, canonicalize } from './files.js'
import path from 'path'
import * as vscode from 'vscode'

const watchersBySession = new Map()

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchersFor = (sessionId) => {
  let watchers = watchersBySession.get(sessionId)

  if (!watchers) {
    watchers = new Map()

    watchersBySession.set(sessionId, watchers)
  }

  return watchers
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const watchFilesOutsideWorkspace = (targets, workspaceFolders, sessionId) => {
  const workspaceRoots = workspaceFolders.map(canonicalize)
  const watchers = watchersFor(sessionId)

  for (const target of targets) {
    if (watchers.has(target)) continue
    if (workspaceRoots.some((root) => isUnder(canonicalize(target), root))) continue

    const dir = vscode.Uri.file(path.dirname(target))
    const pattern = new vscode.RelativePattern(dir, path.basename(target))

    watchers.set(target, vscode.workspace.createFileSystemWatcher(pattern))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const disposeWatchers = (sessionId) => {
  const watchers = watchersBySession.get(sessionId)

  if (!watchers) return

  watchers.forEach((watcher) => watcher.dispose())
  watchersBySession.delete(sessionId)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const disposeAllWatchers = () => {
  watchersBySession.forEach((watchers) => watchers.forEach((watcher) => watcher.dispose()))
  watchersBySession.clear()
}
