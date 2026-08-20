import { sameContents } from './util/files.js'
import { getProjectKey, getManifestFile } from './util/paths.js'
import { getWorkspaceFolders } from './util/workspace.js'
import fs from 'fs'
import * as vscode from 'vscode'

let lastRendered = null

const SCHEME = 'claude-before'

const DEFAULT_TITLE = 'Last turn changes'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beforeUriFor = (absolutePath, stamp) => {
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

const stillRenderable = (absolutePath, beforeImage, status) => {
  const existsNow = fs.existsSync(absolutePath)

  if (status === 'A') return existsNow
  if (!fs.existsSync(beforeImage)) return false

  return !(existsNow && sameContents(beforeImage, absolutePath))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const toResources = (manifest) => {
  const resources = []

  for (const [absolutePath, beforeImage, , status] of manifest.files) {
    if (!stillRenderable(absolutePath, beforeImage, status)) continue

    const fileUri = vscode.Uri.file(absolutePath)

    const original = status === 'A' ? undefined : beforeUriFor(absolutePath, manifest.ts)
    const modified = status === 'D' ? undefined : fileUri

    resources.push([fileUri, original, modified])
  }

  return resources
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const showLastTurn = async ({ force = false } = {}) => {
  const manifest = readManifest()
  const title = manifest?.title || DEFAULT_TITLE

  if (!manifest) {
    if (force) await vscode.commands.executeCommand('vscode.changes', title, [])

    return
  }

  if (!force && manifest.ts === lastRendered) return

  lastRendered = manifest.ts

  const resources = toResources(manifest)

  if (!resources.length) {
    if (force) await vscode.commands.executeCommand('vscode.changes', title, [])

    return
  }

  await vscode.commands.executeCommand('vscode.changes', title, resources)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readBeforeImage = (uri, params = {}) => {
  const manifest = readManifest()

  if (manifest && uri.query === manifest.ts) {
    for (const [absolutePath, beforeImage] of manifest.files) {
      if (absolutePath !== uri.fsPath) continue

      try { return params.size ? fs.statSync(beforeImage).size : fs.readFileSync(beforeImage) } catch { break }
    }
  }

  throw vscode.FileSystemError.FileNotFound(uri)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beforeImageProvider = {
  onDidChangeFile: () => new vscode.Disposable(() => {}),
  watch: () => new vscode.Disposable(() => {}),
  stat: (uri) => ({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: readBeforeImage(uri, { size: true }) }),
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
  lastRendered = readManifest()?.ts ?? null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const forgetLastRenderedTurn = () => {
  lastRendered = null
}
