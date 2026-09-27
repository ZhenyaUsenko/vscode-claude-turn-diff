import { JEV_DIR } from './paths.mjs'
import { buildTestsDocument } from './prompt.mjs'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const STUB_DIR = join(JEV_DIR, 'suite', 'vscode')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isWorkspaceFile = (source) => basename(source) !== '.DS_Store'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const prepareSuiteWorkspace = (run, rootDir) => {
  const codeDir = join(rootDir, 'code')
  const stubDir = join(rootDir, 'node_modules', 'vscode')
  const scratchDir = join(rootDir, 'scratch')
  const promptFile = join(rootDir, 'tests.md')

  cpSync(run.codeDir, codeDir, { recursive: true, filter: isWorkspaceFile })
  cpSync(STUB_DIR, stubDir, { recursive: true, filter: isWorkspaceFile })
  mkdirSync(scratchDir)
  writeFileSync(promptFile, buildTestsDocument('behavior-tests.md', run.group))

  return { codeDir, stubDir, scratchDir, promptFile }
}
