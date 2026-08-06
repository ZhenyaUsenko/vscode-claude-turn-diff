// Rendering half: turn a manifest into VS Code's multi-file diff editor.

const fs = require('fs')
const path = require('path')
const vscode = require('vscode')

const { projectKey, manifestFor } = require('./util/paths')
const { sameContents } = require('./util/files')

// The multi-diff editor decides a file was RENAMED by comparing
// originalUri.path !== modifiedUri.path. Pointing `original` straight at the
// before-image on disk therefore struck through every filename and stamped it
// "R". Serving it through a scheme that keeps the real path verbatim means only
// the scheme differs, so no rename is inferred.
const SCHEME = 'claude-before'

const beforeImageByUri = new Map()
let lastRendered = null

const workspaceFolders = () =>
  (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath)

const manifestPath = () => {
  const folders = workspaceFolders()
  return folders.length ? manifestFor(projectKey(folders[0])) : null
}

const readManifest = () => {
  const file = manifestPath()
  if (!file || !fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// The status was frozen when the manifest was written; the tree may have moved
// on since. Drop entries that no longer represent something renderable.
const stillRenderable = (absolutePath, beforeImage, status) => {
  const existsNow = fs.existsSync(absolutePath)
  if (status === 'A') return existsNow // added, then deleted again
  if (!fs.existsSync(beforeImage)) return false // before-image reclaimed
  return !(existsNow && sameContents(beforeImage, absolutePath)) // reverted by hand
}

const toResources = (manifest) => {
  const resources = []
  beforeImageByUri.clear() // superseded turns have had their images reclaimed
  for (const [absolutePath, beforeImage, , status] of manifest.files) {
    if (!stillRenderable(absolutePath, beforeImage, status)) continue

    const fileUri = vscode.Uri.file(absolutePath)
    const beforeUri = fileUri.with({ scheme: SCHEME, query: manifest.ts })

    beforeImageByUri.set(beforeUri.toString(), beforeImage)

    if (status === 'A') resources.push([fileUri, undefined, fileUri])
    else if (status === 'D') resources.push([fileUri, beforeUri, undefined])
    else resources.push([fileUri, beforeUri, fileUri])
  }
  return resources
}

const showLastTurn = async ({ force = false } = {}) => {
  const manifest = readManifest()
  const title = manifest?.title || 'Last turn changes'

  if (!manifest) {
    // The editor renders its own "No Changed Files" state, which says it
    // better than a notification would.
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

const registerBeforeImageProvider = () =>
  vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
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

// Called at activation so a turn already on disk is not replayed, and after a
// workspace change so the next one is.
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
