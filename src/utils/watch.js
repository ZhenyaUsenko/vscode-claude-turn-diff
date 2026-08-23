import { isUnder, canonicalize } from './files.js'
import { basename, dirname } from 'path'
import { RelativePattern, Uri, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchersBySession = new Map()

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getWatchers = (sessionId) => {
  let watchers = watchersBySession.get(sessionId)

  if (!watchers) {
    watchers = new Map()

    watchersBySession.set(sessionId, watchers)
  }

  return watchers
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const watchFilesOutsideWorkspace = (targetFiles, workspaceFolders, sessionId) => {
  const workspaceRoots = workspaceFolders.map(canonicalize)
  const watchers = getWatchers(sessionId)

  for (const targetFile of targetFiles) {
    if (watchers.has(targetFile)) continue
    if (workspaceRoots.some((root) => isUnder(canonicalize(targetFile), root))) continue

    const dir = Uri.file(dirname(targetFile))
    const pattern = new RelativePattern(dir, basename(targetFile))

    watchers.set(targetFile, workspace.createFileSystemWatcher(pattern))
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
