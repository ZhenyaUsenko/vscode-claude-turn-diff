import { JEV_DIR } from './paths.mjs'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BUGS_DIR = join(JEV_DIR, 'bugs')

const PATCH_NAME = /^\d+-(.+)\.patch$/

const CLEAN_SUMMARY = 'no bug, the code as it is in the repository'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listPatchFiles = () => {
  const files = readdirSync(BUGS_DIR).filter((file) => PATCH_NAME.test(file)).sort()

  return Object.fromEntries(files.map((file) => [file.match(PATCH_NAME)[1], join(BUGS_DIR, file)]))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const PATCH_FILES = listPatchFiles()

export const BUG_NAMES = ['clean', ...Object.keys(PATCH_FILES)]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readBugSummary = (name) => {
  if (name === 'clean') return CLEAN_SUMMARY

  const patch = readFileSync(PATCH_FILES[name], 'utf8')

  return patch.slice(0, patch.indexOf('\n--- ')).trim()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const applyBug = (codeDir, name) => {
  if (name === 'clean') return

  execFileSync('patch', ['-p1', '--forward', '--fuzz=0', '--silent', '-d', codeDir, '-i', PATCH_FILES[name]])
}
