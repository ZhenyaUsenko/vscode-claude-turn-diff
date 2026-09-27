import { findRolloutFile } from '../lib/codex.mjs'
import { JEV_DIR, REPO_DIR, RUNS_DIR } from '../lib/paths.mjs'
import { buildPrompt } from '../lib/prompt.mjs'
import { formatSummary, recordRun } from '../lib/record.mjs'
import { prepareSuiteWorkspace } from '../lib/suite-workspace.mjs'
import { spawn } from 'node:child_process'
import { closeSync, copyFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync } from 'node:fs'
import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

const BUILD_PROMPT_FILE = join(JEV_DIR, 'claude', 'build-prompt.mjs')

const AGENTS_DIR = join(REPO_DIR, '.claude', 'agents')

const EXTENSIONS_DIR = join(homedir(), '.vscode', 'extensions')

const MODELS_CACHE_FILE = join(homedir(), '.codex', 'models_cache.json')

const FRONTMATTER = /^---\n[\s\S]*?\n---\n/

const DEFAULT_AGENTS = {
  closed: 'text-tests-closed',
  open: 'text-tests-open',
  suite: 'text-tests-suite-codex',
}

const SANDBOXES = {
  closed: 'read-only, no tools',
  open: 'workspace-write, network on',
  suite: 'workspace-write, network on',
}

const LEAN_FEATURES_OFF = [
  'apps', 'browser_use', 'browser_use_external', 'code_mode_host', 'computer_use', 'goals', 'hooks', 'image_generation',
  'in_app_browser', 'memories', 'multi_agent', 'plugins', 'realtime_conversation', 'remote_plugin', 'shell_tool',
  'skill_mcp_dependency_install', 'skill_search', 'sleep_tool', 'tool_call_mcp_elicitation', 'tool_suggest',
  'unified_exec', 'view_image', 'workspace_dependencies',
]

const LEAN_CONFIG = [
  'skills.include_instructions=false',
  'include_permissions_instructions=false',
  'include_environment_context=false',
  'include_apps_instructions=false',
  'include_collaboration_mode_instructions=false',
  'web_search="disabled"',
]

const LEAN_MODEL_FIELDS = {
  multi_agent_version: null,
  experimental_supported_tools: [],
  tool_mode: null,
  apply_patch_tool_type: null,
}

const ARG_OPTIONS = {
  runs: { type: 'string' },
  batch: { type: 'string' },
  agent: { type: 'string' },
  model: { type: 'string', default: 'gpt-6-luna' },
  effort: { type: 'string', default: 'high' },
  fast: { type: 'boolean', default: false },
  summary: { type: 'string' },
  concurrency: { type: 'string', default: '8' },
  'stop-at': { type: 'string', default: '0.8' },
  'timeout-minutes': { type: 'string', default: '45' },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2))

const readDefinition = (agent) => readFileSync(join(AGENTS_DIR, `${agent}.md`), 'utf8')

const readInstructions = (agent) => readDefinition(agent).replace(FRONTMATTER, '').trim()

const readThreadId = (eventsFile) => JSON.parse(readFileSync(eventsFile, 'utf8').split('\n')[0]).thread_id

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findCodexBinary = () => {
  const names = readdirSync(EXTENSIONS_DIR).filter((name) => name.startsWith('openai.chatgpt-')).sort()

  return join(EXTENSIONS_DIR, names.at(-1), 'bin', 'macos-aarch64', 'codex')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const createCodexHome = () => {
  const codexHome = mkdtempSync(join(tmpdir(), 'codex-home-'))

  symlinkSync(join(homedir(), '.codex', 'auth.json'), join(codexHome, 'auth.json'))

  return codexHome
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const writeLeanCatalog = (codexHome) => {
  const catalog = readJson(MODELS_CACHE_FILE)
  const catalogFile = join(codexHome, 'lean-catalog.json')

  for (const model of catalog.models) Object.assign(model, LEAN_MODEL_FIELDS)

  writeFileSync(catalogFile, JSON.stringify(catalog))

  return catalogFile
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const removeCodexHome = (codexHome) => {
  const authFile = join(codexHome, 'auth.json')

  if (lstatSync(authFile).isSymbolicLink()) return void rmSync(codexHome, { recursive: true, force: true })

  console.log(`Codex refreshed the login into ${authFile}; ~/.codex/auth.json may need a new sign-in`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const prepareClosedLayout = (run, rootDir, instructions) => {
  const promptFile = join(rootDir, 'prompt.md')
  const instructionsFile = join(rootDir, 'instructions.md')

  writeFileSync(promptFile, buildPrompt(run.codeDir, 'behavior-tests.md', run.group))
  writeFileSync(instructionsFile, instructions)

  return { codeDir: run.codeDir, promptFile, instructionsFile }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const prepareLayout = (run, rootDir, instructions) => {
  const codeDir = join(rootDir, 'code')
  const scratchDir = run.approach === 'open' ? join(rootDir, 'scratch') : undefined

  if (run.approach === 'closed') return prepareClosedLayout(run, rootDir, instructions)
  if (run.approach === 'suite') return prepareSuiteWorkspace(run, rootDir)

  cpSync(run.codeDir, codeDir, { recursive: true })

  if (scratchDir) mkdirSync(scratchDir)

  return { codeDir, scratchDir, promptFile: join(rootDir, 'prompt.md') }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildPromptText = (run, rootDir, layout, instructions) => {
  const group = run.group ? ` --group ${run.group}` : ''
  const command = `node ${BUILD_PROMPT_FILE} --src ${layout.codeDir} --out ${layout.promptFile}${group}`
  const scratch = layout.scratchDir ? `\n\nScratch directory: ${layout.scratchDir}` : ''

  if (run.approach === 'closed') return readFileSync(layout.promptFile, 'utf8')
  if (run.approach === 'suite') return `${instructions}\n\nWorkspace: ${rootDir}`

  return `${instructions}\n\nCommand:\n\n${command}${scratch}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const prepareRun = (runId, settings) => {
  const run = readJson(join(RUNS_DIR, `${runId}.json`))
  const agent = settings.agent ?? DEFAULT_AGENTS[run.approach]
  const instructions = readInstructions(agent)
  const rootDir = mkdtempSync(join(tmpdir(), `text-tests-${run.id}-`))
  const layout = prepareLayout(run, rootDir, instructions)
  const prompt = buildPromptText(run, rootDir, layout, instructions)
  const closedMessage = `System prompt:\n\n${instructions}\n\nPrompt: the contents of prompt.md`
  const message = run.approach === 'closed' ? closedMessage : prompt
  const { model, effort, fast, summary, codexHome } = settings
  const sandbox = SANDBOXES[run.approach]
  const cliLaunch = { cwd: rootDir, layout, agent, model, effort, fast, summary, sandbox, codexHome }

  Object.assign(run, { batch: settings.batch, mechanism: 'codex', message, cliLaunch })
  writeJson(join(RUNS_DIR, `${run.id}.json`), run)

  return { run, rootDir, prompt, layout }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildLeanArgs = (settings, layout) => {
  return [
    '-c', `model_instructions_file="${layout.instructionsFile}"`,
    '-c', `model_catalog_json="${settings.catalogFile}"`,
    ...LEAN_CONFIG.flatMap((setting) => ['-c', setting]),
    ...LEAN_FEATURES_OFF.flatMap((feature) => ['--disable', feature]),
    '-s', 'read-only',
  ]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildSandboxArgs = () => {
  return [
    '-c', 'tool_output_token_limit=25000',
    '-c', 'sandbox_workspace_write.network_access=true',
    '-s', 'workspace-write',
  ]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildArgs = (settings, { run, rootDir, layout }) => {
  const approachArgs = run.approach === 'closed' ? buildLeanArgs(settings, layout) : buildSandboxArgs()
  const tierArgs = settings.fast ? ['-c', 'service_tier="fast"'] : []
  const summaryArgs = settings.summary ? ['-c', `model_reasoning_summary="${settings.summary}"`] : []

  return [
    'exec',
    '-m', settings.model,
    '-c', `model_reasoning_effort=${settings.effort}`,
    ...tierArgs,
    ...summaryArgs,
    ...approachArgs,
    '--ignore-user-config',
    '--ignore-rules',
    '--skip-git-repo-check',
    '-C', rootDir,
    '--json',
    '-',
  ]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const launchRun = (prepared, settings) => {
  const { run, rootDir } = prepared
  const eventsFile = join(RUNS_DIR, run.id, 'codex-events.jsonl')
  const eventsFd = openSync(eventsFile, 'w')
  const stderrFd = openSync(join(RUNS_DIR, run.id, 'codex-stderr.txt'), 'w')
  const { USER, PATH } = process.env
  const env = { HOME: homedir(), USER, PATH, TMPDIR: tmpdir(), LANG: 'en_US.UTF-8', CODEX_HOME: settings.codexHome }
  const args = buildArgs(settings, prepared)
  const child = spawn(settings.codex, args, { cwd: rootDir, env, stdio: ['pipe', eventsFd, stderrFd] })
  const timer = setTimeout(() => child.kill('SIGTERM'), Number(settings['timeout-minutes']) * 60000)

  child.stdin.end(prepared.prompt)

  return new Promise((resolve) => {
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer)
      closeSync(eventsFd)
      closeSync(stderrFd)
      resolve({ ...prepared, exitCode, signal, eventsFile })
    })
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const keepArtifacts = ({ run, layout }) => {
  const runFile = join(RUNS_DIR, `${run.id}.json`)
  const kept = readJson(runFile)
  const keptScratchDir = layout.scratchDir && join(RUNS_DIR, run.id, 'scratch')
  const keptPromptFile = join(RUNS_DIR, run.id, basename(layout.promptFile))

  if (keptScratchDir) cpSync(layout.scratchDir, keptScratchDir, { recursive: true, force: true })

  copyFileSync(layout.promptFile, keptPromptFile)
  writeJson(runFile, { ...kept, scratchDir: keptScratchDir, promptFile: keptPromptFile, codeDir: layout.codeDir })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const recordLaunched = (launched, state, settings) => {
  try {
    keepArtifacts(launched)

    const rolloutFile = findRolloutFile(settings.codexHome, readThreadId(launched.eventsFile))
    const record = recordRun(launched.run.id, { codex: { rolloutFile, eventsFile: launched.eventsFile } })
    const usage = record.cli.fiveHourUtilization

    console.log(`${formatSummary(record)} (exit ${launched.exitCode}, codex 5h ${usage})`)

    if (usage < state.stopAt) return

    state.queue.length = 0
    console.log(`Codex five-hour window at ${usage}, launching no more runs`)
  } catch (error) {
    const outcome = `exit ${launched.exitCode} ${launched.signal ?? ''}`

    console.log(`${launched.run.id}: ${outcome}, not recorded: ${error.message}`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runQueue = async (state, settings) => {
  while (state.queue.length) {
    const prepared = prepareRun(state.queue.shift(), settings)

    recordLaunched(await launchRun(prepared, settings), state, settings)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })
  const codexHome = createCodexHome()
  const settings = { ...options, codex: findCodexBinary(), codexHome, catalogFile: writeLeanCatalog(codexHome) }
  const state = { queue: options.runs.split(','), stopAt: Number(options['stop-at']) }
  const concurrency = Math.min(Number(options.concurrency), state.queue.length)
  const speed = options.fast ? 'fast' : 'standard'
  const reasoning = `reasoning summaries ${options.summary ?? 'off'}`
  const instructions = options.agent ?? 'instructions per approach'
  const setup = `${options.model} at ${options.effort}, ${speed}, ${reasoning}, ${instructions}`
  const launchLine = `${setup}, ${concurrency} at a time, stop at ${state.stopAt}`

  console.log(`${options.batch}: ${state.queue.length} runs, ${launchLine}`)

  await Promise.all(Array.from({ length: concurrency }, () => runQueue(state, settings)))

  removeCodexHome(settings.codexHome)
}

main()
