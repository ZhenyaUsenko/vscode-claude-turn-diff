import { getManifestFile } from './paths.js'
import { readFileSync, renameSync, writeFileSync } from 'fs'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const publishManifest = (project, stamp, entries) => {
  const manifestFile = getManifestFile(project)
  const manifestBody = { ts: `${stamp}-${process.pid}`, files: entries }

  writeFileSync(`${manifestFile}.tmp`, JSON.stringify(manifestBody))
  renameSync(`${manifestFile}.tmp`, manifestFile)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readManifest = (project) => {
  try { return JSON.parse(readFileSync(getManifestFile(project), 'utf8')) } catch { return null }
}
