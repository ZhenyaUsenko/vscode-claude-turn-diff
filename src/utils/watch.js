import { isUnder, canonicalize } from './files.js'
import { dirname } from 'node:path'
import { RelativePattern, Uri, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const MAX_WATCHED_DIRS = 100

const outsideWatchers = new Map()

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const watchFilesOutsideWorkspace = (targetFiles, workspaceDirs) => {
  const canonicalWorkspaceDirs = workspaceDirs.map(canonicalize)

  for (const targetFile of targetFiles) {
    const dir = dirname(targetFile)
    const existingWatcher = outsideWatchers.get(dir)

    if (existingWatcher) {
      outsideWatchers.delete(dir)
      outsideWatchers.set(dir, existingWatcher)

      continue
    }

    if (canonicalWorkspaceDirs.some((workspaceDir) => isUnder(canonicalize(targetFile), workspaceDir))) continue

    outsideWatchers.set(dir, workspace.createFileSystemWatcher(new RelativePattern(Uri.file(dir), '*')))

    if (outsideWatchers.size > MAX_WATCHED_DIRS) {
      const [oldestDir, oldestWatcher] = outsideWatchers.entries().next().value

      oldestWatcher.dispose()
      outsideWatchers.delete(oldestDir)
    }
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const disposeOutsideWatchers = () => {
  outsideWatchers.forEach((watcher) => watcher.dispose())
  outsideWatchers.clear()
}
