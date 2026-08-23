import { readFile } from '../utils/files.js'
import { getManifestFile } from './paths.js'
import { renameSync, writeFileSync } from 'fs'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const publishManifest = (project, stamp, entries) => {
  const manifestFile = getManifestFile(project)
  const manifestBody = { ts: `${stamp}-${process.pid}`, files: entries }

  writeFileSync(`${manifestFile}.tmp`, JSON.stringify(manifestBody))
  renameSync(`${manifestFile}.tmp`, manifestFile)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readManifest = (project) => {
  const manifestBody = readFile(getManifestFile(project), 'utf8')

  return manifestBody ? JSON.parse(manifestBody) : undefined
}
