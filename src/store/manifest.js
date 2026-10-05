import { readFile, removeFile, replaceFile } from '../utils/files.js'
import { getManifestFile } from './paths.js'
import { randomUUID } from 'node:crypto'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const removeManifest = (project) => {
  removeFile(getManifestFile(project))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const publishManifest = (project, changes, params) => {
  const manifestBody = { id: randomUUID(), changes, running: params.running }

  replaceFile(getManifestFile(project), JSON.stringify(manifestBody))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readManifest = (project) => {
  const manifestBody = readFile(getManifestFile(project), 'utf8')

  return manifestBody ? JSON.parse(manifestBody) : undefined
}
