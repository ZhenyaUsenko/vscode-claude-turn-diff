import { readManifest } from './store/manifest.js'
import { getProjectKey } from './store/paths.js'
import { getFileSize, readFile, sameContents } from './utils/files.js'
import { getWorkspaceFolders } from './utils/workspace.js'
import { existsSync } from 'fs'
import * as vscode from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let lastRenderedStamp = null

const SCHEME = 'claude-before'

const EDITOR_TITLE = 'Last turn changes'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBeforeUri = (absolutePath, stamp) => {
  return vscode.Uri.file(absolutePath).with({ scheme: SCHEME, query: stamp })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readCurrentManifest = () => {
  const workspaceFolders = getWorkspaceFolders()

  if (!workspaceFolders.length) return

  return readManifest(getProjectKey(workspaceFolders[0]))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const stillRenderable = (beforePath, beforeImage, afterPath, status) => {
  const afterFileExists = existsSync(afterPath)

  if (status === 'A') return afterFileExists
  if (!existsSync(beforeImage)) return false
  if (beforePath !== afterPath) return afterFileExists

  return !(afterFileExists && sameContents(beforeImage, afterPath))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getResources = (manifest) => {
  const resources = []

  for (const { beforePath, beforeImage, afterPath, status } of manifest?.files ?? []) {
    if (!stillRenderable(beforePath, beforeImage, afterPath, status)) continue

    const fileUri = vscode.Uri.file(afterPath)

    const original = status === 'A' ? undefined : getBeforeUri(beforePath, manifest.ts)
    const modified = status === 'D' ? undefined : fileUri

    resources.push([fileUri, original, modified])
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
    await vscode.commands.executeCommand('vscode.changes', EDITOR_TITLE, resources)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readBeforeImage = (uri, params) => {
  const manifest = readCurrentManifest()

  if (manifest && uri.query === manifest.ts) {
    for (const { beforePath, beforeImage } of manifest.files) {
      if (beforePath !== uri.fsPath) continue

      const image = params?.sizeOnly ? getFileSize(beforeImage) : readFile(beforeImage)

      if (image == null) break

      return image
    }
  }

  throw vscode.FileSystemError.FileNotFound(uri)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beforeImageProvider = {
  onDidChangeFile: () => new vscode.Disposable(() => {}),
  watch: () => new vscode.Disposable(() => {}),
  stat: (uri) => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: readBeforeImage(uri, { sizeOnly: true }) }),
  readFile: (uri) => readBeforeImage(uri),
  readDirectory: () => { throw vscode.FileSystemError.FileNotADirectory() },
  createDirectory: () => { throw vscode.FileSystemError.NoPermissions() },
  writeFile: () => { throw vscode.FileSystemError.NoPermissions() },
  delete: () => { throw vscode.FileSystemError.NoPermissions() },
  rename: () => { throw vscode.FileSystemError.NoPermissions() },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const registerBeforeImageProvider = () => {
  const options = { isReadonly: true, isCaseSensitive: true }

  return vscode.workspace.registerFileSystemProvider(SCHEME, beforeImageProvider, options)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const markCurrentTurnAsSeen = () => {
  lastRenderedStamp = readCurrentManifest()?.ts ?? null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const forgetLastRenderedTurn = () => {
  lastRenderedStamp = null
}
