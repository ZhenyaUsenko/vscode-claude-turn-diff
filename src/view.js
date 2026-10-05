import { readManifest } from './store/manifest.js'
import { getBeforeImagesDir } from './store/paths.js'
import { publishArmedTurn } from './turn/index.js'
import { getFileSize, readFile, sameContents } from './utils/files.js'
import { getCurrentProject } from './utils/workspace.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { commands, Disposable, FileSystemError, FileType, Uri, workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const SCHEME = 'claude-before'

const LAST_TURN_TITLE = 'Last turn changes'

const RUNNING_TURN_TITLE = 'Changes so far'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getResources = (project, manifest) => {
  const resources = []

  const beforeImagesDir = getBeforeImagesDir(project)

  if (!manifest || !existsSync(beforeImagesDir)) return resources

  const beforeUriParams = { scheme: SCHEME, query: manifest.id }

  for (const { beforeFile, afterFile } of manifest.changes) {
    const beforeImageFile = join(beforeImagesDir, beforeFile)

    const beforeImageExists = existsSync(beforeImageFile)
    const afterFileExists = existsSync(afterFile)

    if (!beforeImageExists && !afterFileExists) continue

    if (beforeFile === afterFile && sameContents(beforeImageFile, afterFile)) continue

    const beforeUri = beforeImageExists ? Uri.file(beforeFile).with(beforeUriParams) : undefined
    const afterUri = afterFileExists ? Uri.file(afterFile) : undefined

    resources.push([afterUri ?? Uri.file(beforeFile), beforeUri, afterUri])
  }

  return resources
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const showLastTurn = async (params) => {
  const project = getCurrentProject()

  if (params?.force) await publishArmedTurn(project)

  const manifest = readManifest(project)

  const resources = getResources(project, manifest)

  const title = manifest?.running ? RUNNING_TURN_TITLE : LAST_TURN_TITLE

  if (!resources.length && !params?.force) return

  await commands.executeCommand('vscode.changes', title, resources)

  if (resources.length && !manifest.running) await commands.executeCommand('workbench.action.keepEditor')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readBeforeImage = (uri, getImageData) => {
  const project = getCurrentProject()

  if (readManifest(project)?.id !== uri.query) throw FileSystemError.FileNotFound(uri)

  const imageData = getImageData(join(getBeforeImagesDir(project), uri.fsPath))

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
