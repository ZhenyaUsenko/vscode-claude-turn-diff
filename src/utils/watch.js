import { isUnder, canonicalize } from './files.js'
import { basename, dirname } from 'node:path'
import { RelativePattern, Uri, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watchersBySession = new Map()

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getOutsideWatchers = (sessionId) => {
  let watchers = watchersBySession.get(sessionId)

  if (!watchers) {
    watchers = new Map()

    watchersBySession.set(sessionId, watchers)
  }

  return watchers
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const watchFilesOutsideWorkspace = (targetFiles, workspaceDirs, sessionId) => {
  const canonicalWorkspaceDirs = workspaceDirs.map(canonicalize)
  const watchers = getOutsideWatchers(sessionId)

  for (const targetFile of targetFiles) {
    if (watchers.has(targetFile)) continue
    if (canonicalWorkspaceDirs.some((workspaceDir) => isUnder(canonicalize(targetFile), workspaceDir))) continue

    const dirUri = Uri.file(dirname(targetFile))
    const pattern = new RelativePattern(dirUri, basename(targetFile))

    watchers.set(targetFile, workspace.createFileSystemWatcher(pattern))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const disposeOutsideWatchers = (sessionId) => {
  const watchers = watchersBySession.get(sessionId)

  if (!watchers) return

  watchers.forEach((watcher) => watcher.dispose())
  watchersBySession.delete(sessionId)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const disposeAllOutsideWatchers = () => {
  watchersBySession.forEach((watchers) => watchers.forEach((watcher) => watcher.dispose()))
  watchersBySession.clear()
}
