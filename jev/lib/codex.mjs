import { RUNS_DIR } from './paths.mjs'
import { copyFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TOOL_ITEMS = ['command_execution', 'file_change', 'mcp_tool_call', 'web_search']

const SHELL_WRAPPER = /^\/bin\/(?:ba|z)?sh -lc (['"])([\s\S]*)\1$/

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readLines = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))

const unwrapCommand = (command) => command.match(SHELL_WRAPPER)?.[2] ?? command

const isTokenCount = (entry) => entry.payload?.type === 'token_count' && entry.payload.info

const listPaths = (changes) => changes.map((change) => change.path).join(' ')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const toToolCall = (item) => {
  if (item.type === 'command_execution') return { name: 'Bash', summary: unwrapCommand(item.command) }
  if (item.type === 'file_change') return { name: 'Edit', summary: listPaths(item.changes) }

  return { name: item.type, summary: JSON.stringify(item).slice(0, 300) }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const toTokens = (usage) => {
  const cacheRead = usage.cached_input_tokens
  const cacheCreation = usage.cache_write_input_tokens
  const input = usage.input_tokens - cacheRead - cacheCreation

  return { input, cacheCreation, cacheRead, output: usage.output_tokens }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const findRolloutFile = (codexHome, threadId) => {
  const sessionsDir = join(codexHome, 'sessions')
  const name = readdirSync(sessionsDir, { recursive: true }).map(String).find((path) => path.includes(threadId))

  return join(sessionsDir, name)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readUsage = (entries) => {
  const counts = entries.filter(isTokenCount).map((entry) => entry.payload)
  const { info, rate_limits: limits } = counts.at(-1)
  const lastRequest = info.last_token_usage
  const fiveHourUtilization = limits.primary.used_percent / 100
  const sevenDayUtilization = limits.secondary.used_percent / 100

  const cli = { numTurns: counts.length, permissionDenials: [] }

  return {
    requestCount: counts.length,
    tokens: toTokens(info.total_token_usage),
    reasoningTokens: info.total_token_usage.reasoning_output_tokens,
    contextSize: lastRequest.input_tokens + lastRequest.output_tokens,
    cli: { ...cli, fiveHourUtilization, sevenDayUtilization, planType: limits.plan_type },
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const parseCodexRun = (run, { rolloutFile, eventsFile }) => {
  const keptTranscriptFile = join(RUNS_DIR, run.id, 'rollout.jsonl')
  const entries = readLines(rolloutFile)
  const context = entries.find((entry) => entry.type === 'turn_context').payload
  const items = readLines(eventsFile).filter((event) => event.type === 'item.completed').map((event) => event.item)
  const { cli, ...usage } = readUsage(entries)
  const speed = run.cliLaunch.fast ? 'fast' : 'standard'
  const durationMs = Date.parse(entries.at(-1).timestamp) - Date.parse(entries[0].timestamp)
  const toolCalls = items.filter((item) => TOOL_ITEMS.includes(item.type)).map(toToolCall)
  const finalText = items.findLast((item) => item.type === 'agent_message')?.text ?? ''

  const transcript = { models: [context.model], efforts: [context.effort], ...usage, durationMs, toolCalls, finalText }

  if (rolloutFile !== keptTranscriptFile) copyFileSync(rolloutFile, keptTranscriptFile)

  return { transcript, cli: { ...cli, speed, fastModeState: speed === 'fast' ? 'on' : 'off' }, keptTranscriptFile }
}
