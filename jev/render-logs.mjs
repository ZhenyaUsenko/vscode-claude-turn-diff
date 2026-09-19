import { LOGS_DIR } from './lib/paths.mjs'
import { renderLog } from './lib/render.mjs'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listLogFiles = () => {
  const names = readdirSync(LOGS_DIR).filter((name) => name.endsWith('.json'))

  return names.map((name) => join(LOGS_DIR, name))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const logFiles = process.argv.length > 2 ? process.argv.slice(2) : listLogFiles()

  for (const logFile of logFiles) {
    const entry = JSON.parse(readFileSync(logFile, 'utf8'))

    writeFileSync(logFile.replace(/\.json$/, '.md'), renderLog(entry))
  }

  console.log(`${logFiles.length} logs rendered`)
}

main()
