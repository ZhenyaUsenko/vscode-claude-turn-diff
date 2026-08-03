// Rendering half: turn a manifest into VS Code's multi-file diff editor.

const fs = require('fs')
const path = require('path')
const vscode = require('vscode')

const { projectDirFor } = require('./util/paths')
const { sameContents } = require('./util/files')

// The multi-diff editor decides a file was RENAMED by comparing
// originalUri.path !== modifiedUri.path. Pointing `original` straight at the
// before-image on disk therefore struck through every filename and stamped it
// "R". Serving it through a scheme that keeps the real path verbatim means only
// the scheme differs, so no rename is inferred.
const SCHEME = 'claude-before'

const beforeImageByPath = new Map()
const contentsChanged = new vscode.EventEmitter()
let lastRendered = null

const workspaceFolders = () =>
  (vscode.workspace.workspaceFolders || []).map((folder) => folder.uri.fsPath)

const manifestPath = () => {
  const folders = workspaceFolders()
  return folders.length ? path.join(projectDirFor(folders[0]), 'open.json') : null
}

const readManifest = () => {
  const file = manifestPath()
  if (!file) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
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
  for (const [absolutePath, beforeImage, , status] of manifest.files) {
    if (!stillRenderable(absolutePath, beforeImage, status)) continue

    const fileUri = vscode.Uri.file(absolutePath)
    const beforeUri = fileUri.with({ scheme: SCHEME })

    beforeImageByPath.set(fileUri.path, beforeImage)
    contentsChanged.fire(beforeUri) // drop anything cached from a prior turn

    if (status === 'A') resources.push([fileUri, undefined, fileUri])
    else if (status === 'D') resources.push([fileUri, beforeUri, undefined])
    else resources.push([fileUri, beforeUri, fileUri])
  }
  return resources
}

const showLastTurn = async ({ force = false } = {}) => {
  const manifest = readManifest()
  const title = manifest?.title || 'Last turn changes'

  if (!manifest || !Array.isArray(manifest.files) || !manifest.files.length) {
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

  try {
    await vscode.commands.executeCommand('vscode.changes', title, resources)
  } catch {
    // defensive: if the undefined slots used for A and D are ever rejected,
    // fall back to treating everything as a plain modification
    const asModifications = resources.map(([uri]) => [uri, uri.with({ scheme: SCHEME }), uri])
    await vscode.commands.executeCommand('vscode.changes', title, asModifications)
  }
}

const registerBeforeImageProvider = () =>
  vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    onDidChange: contentsChanged.event,
    provideTextDocumentContent: (uri) => {
      const source = beforeImageByPath.get(uri.path)
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
  dispose: () => contentsChanged.dispose(),
}
