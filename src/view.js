import { sameContents } from './util/files.js'
import { projectKey, manifestFor } from './util/paths.js'
import { getWorkspaceFolders } from './util/workspace.js'
import fs from 'fs'
import * as vscode from 'vscode'

const SCHEME = 'claude-before'

const DEFAULT_TITLE = 'Last turn changes'

const beforeImageByUri = new Map()

let lastRendered = null

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readManifest = () => {
  const workspaceFolders = getWorkspaceFolders()

  if (!workspaceFolders.length) return null

  const manifestFile = manifestFor(projectKey(workspaceFolders[0]))

  if (!fs.existsSync(manifestFile)) return null

  return JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
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

const registerBeforeImageProvider = () => {
  return vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    provideTextDocumentContent: (uri) => {
      const beforeImageFile = beforeImageByUri.get(uri.toString())

      if (!beforeImageFile) return ''

      try { return fs.readFileSync(beforeImageFile, 'utf8') } catch { return '' }
    },
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const markCurrentAsSeen = () => {
  lastRendered = readManifest()?.ts ?? null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const forgetLastRendered = () => {
  lastRendered = null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { showLastTurn, registerBeforeImageProvider, markCurrentAsSeen, forgetLastRendered }
