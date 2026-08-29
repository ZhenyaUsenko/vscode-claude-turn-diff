import { readFile, removeFile } from '../utils/files.js'
import { getManifestFile } from './paths.js'
import { renameSync, writeFileSync } from 'node:fs'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const removeManifest = (project) => {
  removeFile(getManifestFile(project))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const publishManifest = (project, changes, params) => {
  const manifestFile = getManifestFile(project)

  const manifestBody = { ts: `${Date.now()}-${process.pid}`, changes, running: params.running }

  writeFileSync(`${manifestFile}.tmp`, JSON.stringify(manifestBody))
  renameSync(`${manifestFile}.tmp`, manifestFile)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readManifest = (project) => {
  const manifestBody = readFile(getManifestFile(project), 'utf8')

  return manifestBody ? JSON.parse(manifestBody) : undefined
}
