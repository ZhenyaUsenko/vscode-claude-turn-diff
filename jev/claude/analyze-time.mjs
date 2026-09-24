import { RUNS_DIR } from '../lib/paths.mjs'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const TIME_KEYS = ['thinking', 'code', 'verdicts', 'otherModel', 'running', 'otherTools']

const TOKEN_KEYS = ['thinking', 'code', 'verdicts', 'otherModel']

const CODE_TOOLS = ['Write', 'Edit', 'MultiEdit']

const HEREDOC = /<<-?\s*'?(\w+)'?\n[\s\S]*?\n\1\b/g

const NODE_RUN = /(?:^|&&|;|\||\(|')\s*(?:env(?:\s+-i)?\s+)?(?:[A-Z_]+=\S*\s+)*node\s+(?!--version|--check|-v\b|-e\b)/m

const SCRIPT_RUN = /(?:^|&&|;|\|)\s*(?:[A-Z_]+=\S*\s+)*(?:(?:ba)?sh\s+\S*run\.sh|\.\/run\.sh)/m

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

const readEntries = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))

const getSum = (values) => values.reduce((sum, value) => sum + value, 0)

const getMedian = (values) => values.toSorted((a, b) => a - b)[Math.floor((values.length - 1) / 2)]

const createCounts = (keys) => Object.fromEntries(keys.map((key) => [key, 0]))

const getResultPairs = (entry) => entry.message.content.map((part) => [part.tool_use_id, Date.parse(entry.timestamp)])

const isCodeWrite = (block) => CODE_TOOLS.includes(block.name) || /cat\s*>[^\n]*<</.test(block.input.command ?? '')

const formatSeconds = (durationMs) => `${Math.round(durationMs / 1000)}s`

const formatThousands = (value) => `${(value / 1000).toFixed(1)}k`

const formatShare = (part, whole) => `${Math.round(part / whole * 100)}%`

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isSuiteRun = (block) => {
  if (block.name !== 'Bash' || block.input.command.includes('build-prompt')) return false

  const command = block.input.command.replace(HEREDOC, '')

  return NODE_RUN.test(command) || SCRIPT_RUN.test(command)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listRequests = (entries) => {
  const requests = []
  let inputTime

  for (const entry of entries) {
    if (entry.type === 'user') inputTime = Date.parse(entry.timestamp)

    if (entry.type !== 'assistant') continue

    const block = { ...entry.message.content[0], time: Date.parse(entry.timestamp) }
    const current = requests.at(-1)

    if (current?.id === entry.requestId) {
      current.blocks.push(block)
      current.usage = entry.message.usage
    } else {
      requests.push({ id: entry.requestId, start: inputTime, blocks: [block], usage: entry.message.usage })
    }
  }

  return requests
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listResultTimes = (entries) => {
  const results = entries.filter((entry) => entry.type === 'user' && Array.isArray(entry.message.content))

  return new Map(results.flatMap(getResultPairs).filter(([id]) => id))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const measureRequest = (request, resultTimes, totals) => {
  const end = request.blocks.at(-1).time
  const thinkingEnd = request.blocks.findLast((block) => block.type === 'thinking')?.time ?? request.start
  const tools = request.blocks.filter((block) => block.type === 'tool_use')
  const kind = tools.some(isCodeWrite) ? 'code' : tools.length ? 'otherModel' : 'verdicts'
  const thinkingTokens = request.usage.output_tokens_details?.thinking_tokens ?? 0

  totals.time.thinking += thinkingEnd - request.start
  totals.time[kind] += end - thinkingEnd
  totals.tokens.thinking += thinkingTokens
  totals.tokens[kind] += request.usage.output_tokens - thinkingTokens

  for (const tool of tools) {
    const toolTime = Math.max(0, (resultTimes.get(tool.id) ?? end) - Math.max(tool.time, end))

    totals.time[isSuiteRun(tool) ? 'running' : 'otherTools'] += toolTime
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const measureRun = (record) => {
  const entries = readEntries(join(RUNS_DIR, record.id, 'transcript.jsonl'))
  const resultTimes = listResultTimes(entries)
  const totals = { time: createCounts(TIME_KEYS), tokens: createCounts(TOKEN_KEYS) }

  for (const request of listRequests(entries)) measureRequest(request, resultTimes, totals)

  return { run: `${record.id} ${record.bug}`, ...totals }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printRuns = (runs) => {
  console.log(`| run | ${TIME_KEYS.join(' | ')} | ${TOKEN_KEYS.map((key) => `${key} tokens`).join(' | ')} |`)
  console.log(`| --- | ${[...TIME_KEYS, ...TOKEN_KEYS].map(() => '---').join(' | ')} |`)

  for (const { run, time, tokens } of runs) {
    const cells = [...TIME_KEYS.map((key) => formatSeconds(time[key])), ...TOKEN_KEYS.map((key) => tokens[key])]

    console.log(`| ${run} | ${cells.join(' | ')} |`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printSummary = (runs, field, keys, format) => {
  const whole = getSum(runs.flatMap((run) => keys.map((key) => run[field][key])))

  console.log(`| ${field} | median per run | share of all |`)
  console.log('| --- | --- | --- |')

  for (const key of keys) {
    const values = runs.map((run) => run[field][key])

    console.log(`| ${key} | ${format(getMedian(values))} | ${formatShare(getSum(values), whole)} |`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const batch = process.argv[2]
  const names = readdirSync(RUNS_DIR).filter((name) => /^r\d+\.json$/.test(name)).sort()
  const records = names.map((name) => readJson(join(RUNS_DIR, name)))
  const runs = records.filter((record) => record.score && record.batch === batch).map(measureRun)

  printRuns(runs)
  console.log()
  printSummary(runs, 'time', TIME_KEYS, formatSeconds)
  console.log()
  printSummary(runs, 'tokens', TOKEN_KEYS, formatThousands)
}

main()
