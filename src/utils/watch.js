import { canonicalize, isUnder, nudgeFile } from './files.js'
import { basename, dirname } from 'node:path'
import { RelativePattern, Uri, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const NUDGE_DELAY = 1000

export const RELEASE_DELAY = 2000

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const outsideWatchers = new Map()

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const watchFilesOutsideWorkspace = (targetFiles, workspaceDirs) => {
  const canonicalWorkspaceDirs = workspaceDirs.map(canonicalize)

  for (const targetFile of targetFiles) {
    if (outsideWatchers.has(targetFile)) continue
    if (canonicalWorkspaceDirs.some((workspaceDir) => isUnder(canonicalize(targetFile), workspaceDir))) continue

    const dirUri = Uri.file(dirname(targetFile))
    const pattern = new RelativePattern(dirUri, basename(targetFile))

    outsideWatchers.set(targetFile, workspace.createFileSystemWatcher(pattern))

    setTimeout(() => nudgeFile(targetFile), NUDGE_DELAY)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const releaseOutsideWatchers = () => {
  const releasedWatchers = [...outsideWatchers.values()]

  outsideWatchers.clear()

  setTimeout(() => releasedWatchers.forEach((watcher) => watcher.dispose()), RELEASE_DELAY)
}
