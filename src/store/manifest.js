import { readFile } from '../utils/files.js'
import { getManifestFile } from './paths.js'
import { renameSync, writeFileSync } from 'node:fs'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const publishManifest = (project, stamp, changes) => {
  const manifestFile = getManifestFile(project)

  writeFileSync(`${manifestFile}.tmp`, JSON.stringify({ ts: `${stamp}-${process.pid}`, changes }))
  renameSync(`${manifestFile}.tmp`, manifestFile)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readManifest = (project) => {
  const manifestBody = readFile(getManifestFile(project), 'utf8')

  return manifestBody ? JSON.parse(manifestBody) : undefined
}
