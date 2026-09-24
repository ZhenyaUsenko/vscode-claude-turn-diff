import { applyBug, BUG_NAMES } from '../lib/bugs.mjs'
import { JEV_DIR, REPO_DIR, RUNS_DIR } from '../lib/paths.mjs'
import { readTests } from '../lib/tests.mjs'
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const COPIED_PATHS = ['package.json', 'src', 'hooks']

const APPROACHES = ['closed', 'open']

const AGENTS_DIR = join(REPO_DIR, '.claude', 'agents')

const BUILD_PROMPT_FILE = join(JEV_DIR, 'claude', 'build-prompt.mjs')

const FRONTMATTER = /^---\n[\s\S]*?\n---\n/

const ARG_OPTIONS = { bugs: { type: 'string' }, approach: { type: 'string' }, groups: { type: 'string' } }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getNextRunNumber = () => {
  const numbers = readdirSync(RUNS_DIR).map((name) => name.match(/^r(\d+)$/)?.[1]).filter(Boolean).map(Number)

  return Math.max(0, ...numbers) + 1
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readInstructions = (approach) => {
  const definition = readFileSync(join(AGENTS_DIR, `text-tests-${approach}.md`), 'utf8')

  return definition.replace(FRONTMATTER, '').trim()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildAgentMessage = (run) => {
  const group = run.group ? ` --group ${run.group}` : ''
  const command = `node ${BUILD_PROMPT_FILE} --src ${run.codeDir} --out ${run.promptFile}${group}`
  const parts = [readInstructions(run.approach), `Command:\n\n${command}`]

  if (run.scratchDir) parts.push(`Scratch directory: ${run.scratchDir}`)

  return parts.join('\n\n')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const createRun = ({ bug, approach, group, condition }) => {
  const id = `r${String(getNextRunNumber()).padStart(2, '0')}`
  const runDir = join(RUNS_DIR, id)
  const codeDir = join(runDir, 'code')
  const scratchDir = approach === 'open' ? join(runDir, 'scratch') : undefined
  const createdAt = new Date().toISOString()
  const run = { id, bug, approach, group, condition, createdAt, codeDir, promptFile: join(runDir, 'prompt.md') }

  for (const path of COPIED_PATHS) cpSync(join(REPO_DIR, path), join(codeDir, path), { recursive: true })

  applyBug(codeDir, bug)

  if (scratchDir) mkdirSync(scratchDir, { recursive: true })

  Object.assign(run, { scratchDir, message: buildAgentMessage({ ...run, scratchDir }) })
  writeFileSync(join(RUNS_DIR, `${id}.json`), JSON.stringify(run, null, 2))

  return run
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listPlans = (options) => {
  const bugs = options.bugs.split(',')
  const suiteNames = readTests('behavior-tests.md').map((suite) => suite.name)
  const groups = options.groups === 'all' ? suiteNames : options.groups?.split(',') ?? [undefined]

  for (const bug of bugs) if (!BUG_NAMES.includes(bug)) throw new Error(`unknown bug ${bug}`)

  for (const group of groups) if (group && !suiteNames.includes(group)) throw new Error(`unknown group ${group}`)

  return bugs.flatMap((bug, index) => {
    return groups.map((group) => ({ bug, approach: options.approach, group, condition: `${index}-${bug}` }))
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })

  if (!APPROACHES.includes(options.approach)) throw new Error(`--approach must be one of ${APPROACHES.join(', ')}`)

  mkdirSync(RUNS_DIR, { recursive: true })

  for (const plan of listPlans(options)) {
    const run = createRun(plan)

    console.log(`=== ${run.id} ${run.approach} ${run.bug}${run.group ? ` ${run.group}` : ''}\n${run.message}\n`)
  }
}

main()
