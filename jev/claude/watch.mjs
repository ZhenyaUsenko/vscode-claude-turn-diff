import { RUNS_DIR } from '../lib/paths.mjs'
import { formatSummary } from '../lib/record.mjs'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const POLL_MS = 5000

const IDLE_WARNINGS_MS = [120000, 300000]

const SLOW_RUN_SECONDS = 15

const PROBLEM = /\b(FAIL|fail(ed|ing)?|Error|not ok|timed? ?out|EADDRINUSE|ECONNREFUSED|EPERM|ENOENT)\b/

const WORKSPACE_PATH = /\/(private\/)?var\/folders\/\S*?text-tests-r\d+-\w+\//g

const RUNS_CODE = /(?:^RUN |[;&|] *)(?:env )?(?:[A-Z_]+=\S* )*(?:node|bash|sh|git)\b|^PATCH|^WAIT/

const CODEX_CALLS = ['custom_tool_call', 'function_call']

const CODEX_OUTPUTS = ['custom_tool_call_output', 'function_call_output']

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

const clean = (text) => text.replace(WORKSPACE_PATH, '').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()

const joinText = (content) => typeof content === 'string' ? content : content.map((part) => part.text).join('')

const sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))

const findProblem = (text) => text.replace(/\\n/g, '\n').split('\n').map(clean).find((line) => PROBLEM.test(line))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readEntries = (file) => {
  const text = readFileSync(file, 'utf8')
  const complete = text.slice(0, text.lastIndexOf('\n') + 1)

  return complete.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findCodexLog = (run) => {
  const eventsFile = join(RUNS_DIR, run.id, 'codex-events.jsonl')
  const sessionsDir = join(run.cliLaunch.codexHome, 'sessions')

  if (!existsSync(eventsFile) || !existsSync(sessionsDir) || !readFileSync(eventsFile, 'utf8').includes('\n')) return

  const threadId = JSON.parse(readFileSync(eventsFile, 'utf8').split('\n')[0]).thread_id
  const name = readdirSync(sessionsDir, { recursive: true }).map(String).find((path) => path.includes(threadId))

  return name && join(sessionsDir, name)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findClaudeLog = (run) => {
  const key = realpathSync(run.cliLaunch.cwd).replace(/[^a-zA-Z0-9]/g, '-')
  const file = join(homedir(), '.claude', 'projects', key, `${run.cliLaunch.sessionId}.jsonl`)

  return existsSync(file) ? file : undefined
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const describeScriptCall = (input) => {
  const files = [...input.matchAll(/\*\*\* (?:Add|Update) File: ([^\n\\]+)/g)].map((match) => clean(match[1]))
  const cmd = input.match(/cmd:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? input.match(/cmd:\s*'((?:[^'\\]|\\.)*)'/)?.[1]

  if (input.includes('apply_patch')) return `PATCH ${files.join(', ')}`
  if (/tools\.write_stdin\(/.test(input) && !cmd) return 'WAIT on a running process'

  return `RUN ${clean(cmd ?? input).slice(0, 140)}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const describeCodexCall = (payload) => {
  if (payload.type === 'custom_tool_call') return describeScriptCall(payload.input)
  if (payload.name === 'wait') return 'WAIT on a running script'

  return `${payload.name} ${clean(payload.arguments).slice(0, 100)}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const describeClaudeCall = ({ name, input }) => {
  if (name === 'Bash') return `RUN ${clean(input.command).slice(0, 140)}`
  if (name === 'Write') return `WRITE ${clean(input.file_path)} (${input.content.split('\n').length} lines)`
  if (['Edit', 'Read'].includes(name)) return `${name.toUpperCase()} ${clean(input.file_path)}`

  return `${name} ${clean(JSON.stringify(input)).slice(0, 100)}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readCodexEvent = (entry, watch) => {
  const payload = entry.payload ?? {}
  const time = Date.parse(entry.timestamp)

  if (payload.type === 'agent_message') return `says: ${clean(payload.message).slice(0, 170)}`
  if (payload.type === 'task_complete') return 'finished, recording'

  if (CODEX_CALLS.includes(payload.type)) {
    const thinking = Math.round((time - watch.ready) / 1000)

    const description = describeCodexCall(payload)

    watch.calls.set(payload.call_id, description)

    return `+${thinking}s think → ${description}`
  }

  if (!CODEX_OUTPUTS.includes(payload.type)) return

  const text = joinText(payload.output)
  const seconds = Number(text.match(/Wall time ([\d.]+) seconds/)?.[1] ?? 0)
  const ranCode = RUNS_CODE.test(watch.calls.get(payload.call_id) ?? '') || text.includes('Script failed')
  const problem = ranCode ? findProblem(text) : undefined

  watch.ready = time

  if (seconds < SLOW_RUN_SECONDS && !problem) return

  return `  ← ${Math.round(seconds)}s${problem ? ` «${problem.slice(0, 150)}»` : ''}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readClaudeEvent = (entry, watch) => {
  const block = entry.message?.content?.[0]
  const time = Date.parse(entry.timestamp)

  if (entry.type === 'assistant' && block?.type === 'text') return `says: ${clean(block.text).slice(0, 170)}`

  if (entry.type === 'assistant' && block?.type === 'tool_use') {
    const thinking = Math.round((time - watch.ready) / 1000)
    const description = describeClaudeCall(block)

    watch.calls.set(block.id, description)

    return `+${thinking}s think → ${description}`
  }

  if (entry.type !== 'user' || block?.type !== 'tool_result') return

  const text = joinText(block.content)
  const ranCode = RUNS_CODE.test(watch.calls.get(block.tool_use_id) ?? '')
  const problem = block.is_error ? clean(text).slice(0, 150) : ranCode ? findProblem(text) : undefined

  watch.ready = time

  return problem ? `  ← «${problem.slice(0, 150)}»` : undefined
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const warnIfIdle = (label, watch) => {
  const idleMs = Date.now() - watch.lastActivity
  const threshold = IDLE_WARNINGS_MS[watch.idleWarnings]

  if (!threshold || idleMs < threshold) return

  watch.idleWarnings += 1
  console.log(`${label} | idle for ${Math.round(idleMs / 60000)} min`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const pollRun = (id, watch) => {
  const run = readJson(join(RUNS_DIR, `${id}.json`))
  const label = `${id} ${run.group ?? run.bug}`

  if (run.score) return void Object.assign(watch, { done: true, summary: formatSummary(run) })
  if (!run.cliLaunch) return

  const logFile = run.mechanism === 'codex' ? findCodexLog(run) : findClaudeLog(run)
  const readEvent = run.mechanism === 'codex' ? readCodexEvent : readClaudeEvent

  if (!logFile) return

  const entries = readEntries(logFile)

  watch.ready ??= Date.parse(entries[0]?.timestamp)

  for (const entry of entries.slice(watch.offset)) {
    const event = readEvent(entry, watch)

    if (event) console.log(`${label} | ${event}`)
  }

  if (entries.length > watch.offset) Object.assign(watch, { lastActivity: Date.now(), idleWarnings: 0 })

  watch.offset = entries.length
  warnIfIdle(label, watch)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const { values: options } = parseArgs({ options: { runs: { type: 'string' } } })
  const createWatch = () => ({ offset: 0, calls: new Map(), lastActivity: Date.now(), idleWarnings: 0, done: false })
  const watches = new Map(options.runs.split(',').map((id) => [id, createWatch()]))

  while ([...watches.values()].some((watch) => !watch.done)) {
    for (const [id, watch] of watches) {
      if (watch.done) continue

      pollRun(id, watch)

      if (watch.done) console.log(`done: ${watch.summary}`)
    }

    await sleep(POLL_MS)
  }
}

main()
