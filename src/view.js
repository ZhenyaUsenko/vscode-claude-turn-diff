import { readManifest } from './store/manifest.js'
import { getFileSize, readFile, sameContents } from './utils/files.js'
import { getCurrentProject } from './utils/workspace.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { commands, Disposable, FileSystemError, FileType, Uri, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let lastRenderedStamp = null

const SCHEME = 'claude-before'

const EDITOR_TITLE = 'Last turn changes'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getResources = (manifest) => {
  const resources = []

  if (!manifest || !existsSync(manifest.beforeDir)) return resources

  for (const { beforeFile, afterFile } of manifest.changes) {
    const beforeImageFile = join(manifest.beforeDir, beforeFile)

    const beforeImageExists = existsSync(beforeImageFile)
    const afterFileExists = existsSync(afterFile)

    if (!beforeImageExists && !afterFileExists) continue

    if (beforeFile === afterFile && sameContents(beforeImageFile, afterFile)) continue

    const beforeUri = beforeImageExists ? Uri.file(beforeFile).with({ scheme: SCHEME, query: manifest.ts }) : undefined

    const afterUri = afterFileExists ? Uri.file(afterFile) : undefined

    resources.push([afterUri ?? Uri.file(beforeFile), beforeUri, afterUri])
  }

  return resources
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const showLastTurn = async (params) => {
  const manifest = readManifest(getCurrentProject())

  if (manifest?.ts === lastRenderedStamp && !params?.force) return

  if (manifest) lastRenderedStamp = manifest.ts

  const resources = getResources(manifest)

  if (resources.length || params?.force) {
    await commands.executeCommand('vscode.changes', EDITOR_TITLE, resources)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readBeforeImage = (uri, getImageData) => {
  const manifest = readManifest(getCurrentProject())

  if (!manifest || uri.query !== manifest.ts) throw FileSystemError.FileNotFound(uri)

  const imageData = getImageData(join(manifest.beforeDir, uri.fsPath))

  if (imageData == null) throw FileSystemError.FileNotFound(uri)

  return imageData
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beforeImageProvider = {
  onDidChangeFile: () => new Disposable(() => {}),
  watch: () => new Disposable(() => {}),
  stat: (uri) => ({ type: FileType.File, ctime: 0, mtime: 0, size: readBeforeImage(uri, getFileSize) }),
  readFile: (uri) => readBeforeImage(uri, readFile),
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
  lastRenderedStamp = readManifest(getCurrentProject())?.ts ?? null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const forgetLastRenderedTurn = () => {
  lastRenderedStamp = null
}
