import { isUnder, canonicalize } from './files.js'
import { basename, dirname } from 'node:path'
import { RelativePattern, Uri, workspace } from 'vscode'

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
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const disposeOutsideWatchers = () => {
  outsideWatchers.forEach((watcher) => watcher.dispose())
  outsideWatchers.clear()
}
