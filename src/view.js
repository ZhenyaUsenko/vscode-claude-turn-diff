import { sameContents } from './utils/files.js'
import { getProjectKey, getManifestFile } from './utils/paths.js'
import { getWorkspaceFolders } from './utils/workspace.js'
import fs from 'fs'
import * as vscode from 'vscode'

let lastRenderedStamp = null

const SCHEME = 'claude-before'

const EDITOR_TITLE = 'Last turn changes'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBeforeUri = (absolutePath, stamp) => {
  return vscode.Uri.file(absolutePath).with({ scheme: SCHEME, query: stamp })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readManifest = () => {
  const workspaceFolders = getWorkspaceFolders()

  if (!workspaceFolders.length) return null

  const manifestFile = getManifestFile(getProjectKey(workspaceFolders[0]))

  try { return JSON.parse(fs.readFileSync(manifestFile, 'utf8')) } catch { return null }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const stillRenderable = (beforePath, beforeImage, afterPath, status) => {
  const afterFileExists = fs.existsSync(afterPath)

  if (status === 'A') return afterFileExists
  if (!fs.existsSync(beforeImage)) return false
  if (beforePath !== afterPath) return afterFileExists

  return !(afterFileExists && sameContents(beforeImage, afterPath))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getResources = (manifest) => {
  const resources = []

  for (const [beforePath, beforeImage, afterPath, status] of manifest.files) {
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
  const manifest = readManifest()

  if (!manifest) {
    if (params?.force) await vscode.commands.executeCommand('vscode.changes', EDITOR_TITLE, [])

    return
  }

  if (!params?.force && manifest.ts === lastRenderedStamp) return

  lastRenderedStamp = manifest.ts

  const resources = getResources(manifest)

  if (!resources.length) {
    if (params?.force) await vscode.commands.executeCommand('vscode.changes', EDITOR_TITLE, [])

    return
  }

  await vscode.commands.executeCommand('vscode.changes', EDITOR_TITLE, resources)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readBeforeImage = (uri, params) => {
  const manifest = readManifest()

  if (manifest && uri.query === manifest.ts) {
    for (const [beforePath, beforeImage] of manifest.files) {
      if (beforePath !== uri.fsPath) continue

      try { return params?.sizeOnly ? fs.statSync(beforeImage).size : fs.readFileSync(beforeImage) } catch { break }
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
  lastRenderedStamp = readManifest()?.ts ?? null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const forgetLastRenderedTurn = () => {
  lastRenderedStamp = null
}
