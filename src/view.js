const fs = require('fs')
const vscode = require('vscode')

const { projectKey, manifestFor } = require('./util/paths')
const { sameContents } = require('./util/files')

const SCHEME = 'claude-before'

const DEFAULT_TITLE = 'Last turn changes'

const beforeImageByUri = new Map()

let lastRendered = null

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const workspaceFolders = () => (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readManifest = () => {
  const folders = workspaceFolders()

  if (!folders.length) return null

  const file = manifestFor(projectKey(folders[0]))

  if (!fs.existsSync(file)) return null

  return JSON.parse(fs.readFileSync(file, 'utf8'))
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

  beforeImageByUri.clear()

  for (const [absolutePath, beforeImage, , status] of manifest.files) {
    if (!stillRenderable(absolutePath, beforeImage, status)) continue

    const fileUri = vscode.Uri.file(absolutePath)
    const beforeUri = fileUri.with({ scheme: SCHEME, query: manifest.ts })

    const original = status === 'A' ? undefined : beforeUri
    const modified = status === 'D' ? undefined : fileUri

    beforeImageByUri.set(beforeUri.toString(), beforeImage)
    resources.push([fileUri, original, modified])
  }

  return resources
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const showLastTurn = async ({ force = false } = {}) => {
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

const registerBeforeImageProvider = () => vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
  provideTextDocumentContent: (uri) => {
    const source = beforeImageByUri.get(uri.toString())

    if (!source) return ''

    try {
      return fs.readFileSync(source, 'utf8')
    } catch {
      return ''
    }
  },
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const markCurrentAsSeen = () => {
  lastRendered = readManifest()?.ts ?? null
}

const forgetLastRendered = () => {
  lastRendered = null
}

module.exports = {
  showLastTurn,
  registerBeforeImageProvider,
  markCurrentAsSeen,
  forgetLastRendered,
  workspaceFolders,
}
