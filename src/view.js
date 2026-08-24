import { readManifest } from './store/manifest.js'
import { getProjectKey } from './store/paths.js'
import { getFileSize, readFile, sameContents } from './utils/files.js'
import { getWorkspaceDirs } from './utils/workspace.js'
import { existsSync } from 'node:fs'
import { commands, Disposable, FileSystemError, FileType, Uri, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let lastRenderedStamp = null

const SCHEME = 'claude-before'

const EDITOR_TITLE = 'Last turn changes'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBeforeUri = (beforeFile, stamp) => {
  return Uri.file(beforeFile).with({ scheme: SCHEME, query: stamp })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readCurrentManifest = () => {
  const workspaceDirs = getWorkspaceDirs()

  if (!workspaceDirs.length) return

  return readManifest(getProjectKey(workspaceDirs[0]))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const stillRenderable = (beforeFile, beforeImageFile, afterFile, status) => {
  const afterFileExists = existsSync(afterFile)

  if (status === 'A') return afterFileExists
  if (!existsSync(beforeImageFile)) return false
  if (beforeFile !== afterFile) return afterFileExists

  return !(afterFileExists && sameContents(beforeImageFile, afterFile))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getResources = (manifest) => {
  const resources = []

  for (const { beforeFile, beforeImageFile, afterFile, status } of manifest?.changes ?? []) {
    if (!stillRenderable(beforeFile, beforeImageFile, afterFile, status)) continue

    const resourceUri = Uri.file(afterFile)

    const beforeUri = status === 'A' ? undefined : getBeforeUri(beforeFile, manifest.ts)
    const afterUri = status === 'D' ? undefined : resourceUri

    resources.push([resourceUri, beforeUri, afterUri])
  }

  return resources
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const showLastTurn = async (params) => {
  const manifest = readCurrentManifest()

  if (manifest?.ts === lastRenderedStamp && !params?.force) return

  if (manifest) lastRenderedStamp = manifest.ts

  const resources = getResources(manifest)

  if (resources.length || params?.force) {
    await commands.executeCommand('vscode.changes', EDITOR_TITLE, resources)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findBeforeImageFile = (uri) => {
  const manifest = readCurrentManifest()

  if (manifest && uri.query === manifest.ts) {
    for (const { beforeFile, beforeImageFile } of manifest.changes) {
      if (beforeFile === uri.fsPath) return beforeImageFile
    }
  }

  throw FileSystemError.FileNotFound(uri)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBeforeImageSize = (uri) => {
  const size = getFileSize(findBeforeImageFile(uri))

  if (size == null) throw FileSystemError.FileNotFound(uri)

  return size
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readBeforeImageContents = (uri) => {
  const contents = readFile(findBeforeImageFile(uri))

  if (contents == null) throw FileSystemError.FileNotFound(uri)

  return contents
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beforeImageProvider = {
  onDidChangeFile: () => new Disposable(() => {}),
  watch: () => new Disposable(() => {}),
  stat: (uri) => ({ type: FileType.File, ctime: 0, mtime: 0, size: getBeforeImageSize(uri) }),
  readFile: (uri) => readBeforeImageContents(uri),
  readDirectory: () => { throw FileSystemError.FileNotADirectory() },
  createDirectory: () => { throw FileSystemError.NoPermissions() },
  writeFile: () => { throw FileSystemError.NoPermissions() },
  delete: () => { throw FileSystemError.NoPermissions() },
  rename: () => { throw FileSystemError.NoPermissions() },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const registerBeforeImageProvider = () => {
  const options = { isReadonly: true, isCaseSensitive: true }

  return workspace.registerFileSystemProvider(SCHEME, beforeImageProvider, options)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const markCurrentTurnAsSeen = () => {
  lastRenderedStamp = readCurrentManifest()?.ts ?? null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const forgetLastRenderedTurn = () => {
  lastRenderedStamp = null
}
