import { RUNS_DIR } from './paths.mjs'
import { cpSync, existsSync, lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const MAX_KEPT_FILE_BYTES = 1024 * 1024

const DEBRIS_NAMES = ['.git', '.claude']

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const holdsDebris = (dir) => DEBRIS_NAMES.some((name) => existsSync(join(dir, name)))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const isAgentFile = (scratchDir, path) => {
  const stats = lstatSync(path)

  if (DEBRIS_NAMES.includes(basename(path))) return false
  if (stats.isDirectory()) return path === scratchDir || !holdsDebris(path)

  return stats.size <= MAX_KEPT_FILE_BYTES
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const keepAgentFiles = (scratchDir, keptScratchDir) => {
  const filter = (path) => isAgentFile(scratchDir, path)

  cpSync(scratchDir, keptScratchDir, { recursive: true, force: true, filter })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const removeRunCode = (runId) => {
  const runFile = join(RUNS_DIR, `${runId}.json`)
  const { codeDir, ...record } = JSON.parse(readFileSync(runFile, 'utf8'))

  rmSync(join(RUNS_DIR, runId, 'code'), { recursive: true, force: true })
  writeFileSync(runFile, JSON.stringify(record, null, 2))
}
