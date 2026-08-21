import { getManifestFile } from './paths.js'
import fs from 'fs'

export const publishManifest = (project, stamp, entries) => {
  const manifestFile = getManifestFile(project)
  const manifestBody = { ts: `${stamp}-${process.pid}`, files: entries }

  fs.writeFileSync(`${manifestFile}.tmp`, JSON.stringify(manifestBody))
  fs.renameSync(`${manifestFile}.tmp`, manifestFile)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readManifest = (project) => {
  try { return JSON.parse(fs.readFileSync(getManifestFile(project), 'utf8')) } catch { return null }
}
