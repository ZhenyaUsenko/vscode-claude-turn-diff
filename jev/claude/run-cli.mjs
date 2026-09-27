import { JEV_DIR, REPO_DIR, RUNS_DIR } from '../lib/paths.mjs'
import { buildPrompt } from '../lib/prompt.mjs'
import { formatSummary, recordRun } from '../lib/record.mjs'
import { prepareSuiteWorkspace } from '../lib/suite-workspace.mjs'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, openSync, readFileSync } from 'node:fs'
import { realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

const BUILD_PROMPT_FILE = join(JEV_DIR, 'claude', 'build-prompt.mjs')

const AGENTS_DIR = join(REPO_DIR, '.claude', 'agents')

const FRONTMATTER = /^---\n[\s\S]*?\n---\n/

const OPEN_TOOLS = 'Bash,Read,Write,Edit,Glob,Grep'

const ARG_OPTIONS = {
  runs: { type: 'string' },
  batch: { type: 'string' },
  agent: { type: 'string' },
  effort: { type: 'string', default: 'high' },
  fast: { type: 'boolean', default: false },
  model: { type: 'string', default: 'claude-opus-5-5' },
  concurrency: { type: 'string', default: '8' },
  'stop-at': { type: 'string', default: '0.85' },
  'timeout-minutes': { type: 'string', default: '45' },
  'cache-ttl': { type: 'string', default: '5m' },
  claude: { type: 'string', default: process.env.CLAUDE_CODE_EXECPATH },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2))

const getProjectKey = (dir) => realpathSync(dir).replace(/[^a-zA-Z0-9]/g, '-')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readInstructions = (agent) => {
  const definition = readFileSync(join(AGENTS_DIR, `${agent}.md`), 'utf8')

  return definition.replace(FRONTMATTER, '').trim()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const prepareClosedLayout = (run, runDir) => {
  writeFileSync(run.promptFile, buildPrompt(run.codeDir, 'behavior-tests.md', run.group))

  return { codeDir: run.codeDir, promptFile: run.promptFile, runDir }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const prepareLayout = (run, rootDir) => {
  const runDir = join(RUNS_DIR, run.id)
  const codeDir = join(rootDir, 'code')
  const scratchDir = join(rootDir, 'scratch')

  if (run.approach === 'closed') return prepareClosedLayout(run, runDir)
  if (run.approach === 'suite') return { ...prepareSuiteWorkspace(run, rootDir), runDir }

  cpSync(run.codeDir, codeDir, { recursive: true })
  mkdirSync(scratchDir, { recursive: true })

  return { codeDir, scratchDir, promptFile: join(rootDir, 'prompt.md'), runDir }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildPromptText = (run, rootDir, layout) => {
  const group = run.group ? ` --group ${run.group}` : ''
  const command = `node ${BUILD_PROMPT_FILE} --src ${layout.codeDir} --out ${layout.promptFile}${group}`
  const scratch = layout.scratchDir ? `\n\nScratch directory: ${layout.scratchDir}` : ''

  if (run.approach === 'closed') return readFileSync(layout.promptFile, 'utf8')
  if (run.approach === 'suite') return `Workspace: ${rootDir}`

  return `Command:\n\n${command}${scratch}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildToolArgs = (run) => {
  if (run.approach === 'closed') return ['--tools', '']

  return ['--tools', OPEN_TOOLS, '--allowedTools', 'Bash', '--permission-mode', 'acceptEdits']
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildArgs = (options, launch) => {
  const settings = options.fast ? { disableAllHooks: true, fastMode: true } : { disableAllHooks: true }

  return [
    '-p',
    '--model', options.model,
    '--effort', options.effort,
    '--system-prompt', launch.instructions,
    ...buildToolArgs(launch.run),
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--settings', JSON.stringify(settings),
    '--session-id', launch.sessionId,
    '--output-format', 'stream-json',
    '--verbose',
  ]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const prepareRun = (runId, options) => {
  const run = readJson(join(RUNS_DIR, `${runId}.json`))
  const agent = options.agent ?? `text-tests-${run.approach}`
  const instructions = readInstructions(agent)
  const sessionId = randomUUID()
  const rootDir = mkdtempSync(join(tmpdir(), `text-tests-${run.id}-`))
  const layout = prepareLayout(run, rootDir)
  const prompt = buildPromptText(run, rootDir, layout)
  const args = buildArgs(options, { run, instructions, sessionId, layout, prompt })
  const shownPrompt = run.approach === 'closed' ? ' the contents of prompt.md' : `\n\n${prompt}`
  const message = `System prompt:\n\n${instructions}\n\nPrompt:${shownPrompt}`
  const { effort, fast, model } = options
  const cliLaunch = { sessionId, cwd: rootDir, layout, agent, effort, fast, model, cacheTtl: options['cache-ttl'] }

  Object.assign(run, { batch: options.batch, mechanism: 'cli', message, cliLaunch })
  writeJson(join(RUNS_DIR, `${run.id}.json`), run)

  return { run, args, cwd: rootDir, sessionId, layout, prompt }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const launchRun = (prepared, options) => {
  const { run, args, cwd, sessionId } = prepared
  const streamFile = join(RUNS_DIR, run.id, 'cli-stream.jsonl')
  const stderrFd = openSync(join(RUNS_DIR, run.id, 'cli-stderr.txt'), 'w')
  const streamFd = openSync(streamFile, 'w')
  const { USER, PATH } = process.env
  const system = { HOME: homedir(), USER, PATH, TMPDIR: tmpdir(), LANG: 'en_US.UTF-8' }
  const env = { ...system, CLAUDE_CODE_PROMPT_CACHE_TTL: options['cache-ttl'] }
  const child = spawn(options.claude, args, { cwd, env, stdio: ['pipe', streamFd, stderrFd] })
  const timer = setTimeout(() => child.kill('SIGTERM'), Number(options['timeout-minutes']) * 60000)

  child.stdin.end(prepared.prompt)

  return new Promise((resolve) => {
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      closeSync(streamFd)
      closeSync(stderrFd)

      const transcriptFile = join(homedir(), '.claude', 'projects', getProjectKey(cwd), `${sessionId}.jsonl`)

      resolve({ ...prepared, exitCode, signal, transcriptFile, streamFile })
    })
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const keepOpenArtifacts = ({ run, layout }) => {
  const runFile = join(RUNS_DIR, `${run.id}.json`)
  const kept = readJson(runFile)
  const keptScratchDir = join(RUNS_DIR, run.id, 'scratch')
  const keptPromptFile = join(RUNS_DIR, run.id, basename(layout.promptFile))

  cpSync(layout.scratchDir, keptScratchDir, { recursive: true, force: true })
  copyFileSync(layout.promptFile, keptPromptFile)
  writeJson(runFile, { ...kept, scratchDir: keptScratchDir, promptFile: keptPromptFile, codeDir: layout.codeDir })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const recordLaunched = (launched, state) => {
  try {
    if (launched.run.approach !== 'closed') keepOpenArtifacts(launched)

    const source = { transcriptFile: launched.transcriptFile, streamFile: launched.streamFile }
    const record = recordRun(launched.run.id, source)
    const { cli } = record
    const extras = `exit ${launched.exitCode}, ${cli.speed}, $${cli.costUsd?.toFixed(2)}, 5h ${cli.fiveHourUtilization}`

    console.log(`${formatSummary(record)} (${extras})`)

    if (cli.fiveHourUtilization == null || cli.fiveHourUtilization < state.stopAt) return

    state.queue.length = 0
    console.log(`five-hour window at ${cli.fiveHourUtilization}, launching no more runs`)
  } catch (error) {
    const outcome = `exit ${launched.exitCode} ${launched.signal ?? ''}`

    console.log(`${launched.run.id}: ${outcome}, not recorded: ${error.message}`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runQueue = async (state, options) => {
  while (state.queue.length) {
    const prepared = prepareRun(state.queue.shift(), options)

    recordLaunched(await launchRun(prepared, options), state)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })
  const state = { queue: options.runs.split(','), stopAt: Number(options['stop-at']) }
  const concurrency = Math.min(Number(options.concurrency), state.queue.length)
  const settings = `effort ${options.effort}, fast ${options.fast}, ${concurrency} at a time, stop at ${state.stopAt}`
  const instructions = options.agent ?? 'per approach'

  console.log(`${options.batch}: ${state.queue.length} runs, ${settings}, instructions ${instructions}`)

  await Promise.all(Array.from({ length: concurrency }, () => runQueue(state, options)))
}

main()
