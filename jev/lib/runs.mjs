import { LOGS_DIR } from './paths.mjs'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getLogLabel = (fileName) => {
  const [, rest] = fileName.replace(/\.json$/, '').split('-tests-')

  return rest?.slice(0, rest.lastIndexOf('-'))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readRun = (label) => {
  const fileNames = readdirSync(LOGS_DIR).filter((name) => name.endsWith('.json') && getLogLabel(name) === label)

  if (!fileNames.length) throw new Error(`no test logs for label ${label}`)

  const nouls = {}

  for (const fileName of fileNames.sort()) {
    const entry = JSON.parse(readFileSync(join(LOGS_DIR, fileName), 'utf8'))

    for (const [id, answer] of Object.entries(entry.response.answers)) nouls[id] = answer.noul
  }

  return { label, nouls }
}
