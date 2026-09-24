import { REPO_DIR } from './paths.mjs'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PROJECT_DIR = join(homedir(), '.claude', 'projects', REPO_DIR.replace(/[^a-zA-Z0-9]/g, '-'))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const findTranscriptFile = (agentId) => {
  const sessionNames = readdirSync(PROJECT_DIR).filter((name) => !name.includes('.'))
  const candidates = sessionNames.map((name) => join(PROJECT_DIR, name, 'subagents', `agent-${agentId}.jsonl`))

  return candidates.find((candidate) => existsSync(candidate))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const summarizeToolInput = (name, input) => {
  if (name === 'Bash') return input.command
  if (name === 'Read') return [input.file_path, input.offset, input.limit].filter((part) => part != null).join(' ')
  if (name === 'Write') return `${input.file_path} (${input.content?.length ?? 0} chars)`
  if (name === 'Edit' || name === 'MultiEdit' || name === 'NotebookEdit') return input.file_path ?? input.notebook_path
  if (name === 'Glob' || name === 'Grep') return `${input.pattern} in ${input.path ?? '.'}`

  return JSON.stringify(input)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const groupRequests = (assistantEntries) => {
  const requests = new Map()

  for (const entry of assistantEntries) {
    const requestId = entry.requestId ?? entry.message.id
    const request = requests.get(requestId) ?? { model: entry.message.model, blocks: [] }

    request.usage = entry.message.usage
    request.blocks.push(...entry.message.content)
    requests.set(requestId, request)
  }

  return [...requests.values()]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const sumTokens = (requests) => {
  const tokens = { input: 0, cacheCreation: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 }

  for (const { usage } of requests) {
    tokens.input += usage.input_tokens ?? 0
    tokens.cacheCreation += usage.cache_creation_input_tokens ?? 0
    tokens.cacheWrite5m += usage.cache_creation?.ephemeral_5m_input_tokens ?? 0
    tokens.cacheWrite1h += usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
    tokens.cacheRead += usage.cache_read_input_tokens ?? 0
    tokens.output += usage.output_tokens ?? 0
  }

  return tokens
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getContextSize = (usage) => {
  return usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens + usage.output_tokens
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const parseTranscript = (transcriptFile) => {
  const lines = readFileSync(transcriptFile, 'utf8').split('\n').filter(Boolean)
  const entries = lines.map((line) => JSON.parse(line))
  const requests = groupRequests(entries.filter((entry) => entry.type === 'assistant'))
  const timestamps = entries.map((entry) => entry.timestamp).filter(Boolean).map((stamp) => Date.parse(stamp))
  const blocks = requests.flatMap((request) => request.blocks)
  const toolUses = blocks.filter((block) => block.type === 'tool_use')
  const toolCalls = toolUses.map(({ name, input }) => ({ name, summary: summarizeToolInput(name, input) }))
  const finalBlocks = requests.at(-1)?.blocks ?? []
  const finalText = finalBlocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
  const models = [...new Set(requests.map((request) => request.model))]
  const durationMs = Math.max(...timestamps) - Math.min(...timestamps)
  const contextSize = getContextSize(requests.at(-1).usage)
  const efforts = [...new Set(entries.filter((entry) => entry.type === 'assistant').map((entry) => entry.effort))]

  const tokens = sumTokens(requests)

  return { models, efforts, requestCount: requests.length, tokens, contextSize, durationMs, toolCalls, finalText }
}
