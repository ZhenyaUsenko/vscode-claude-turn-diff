import { BUG_NAMES } from '../lib/bugs.mjs'
import { REAL_DIR, RUNS_DIR } from '../lib/paths.mjs'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const GROUP_ORDER = [
  'subagent-closed', 'subagent-open', 'cli-high', 'cli-inline-high', 'cli-xhigh', 'cli-fable-high',
  'cli-opus46-high', 'cli-open-high', 'cli-max-split', 'cli-open-tools-high', 'cli-open-suite-high',
  'cli-open-suite-medium',
]

const SKIPPED_GROUPS = ['probe']

const SCORE_LISTS = ['agentFails', 'realFails', 'caught', 'extra', 'missed', 'unanswered']

const TOKEN_KEYS = ['input', 'cacheCreation', 'cacheRead', 'output']

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

const getMedian = (values) => values.toSorted((a, b) => a - b)[Math.floor((values.length - 1) / 2)]

const getSum = (values) => values.reduce((sum, value) => sum + value, 0)

const formatMinutes = (durationMs) => `${(durationMs / 60000).toFixed(1)}m`

const formatThousands = (value) => `${Math.round(value / 1000)}k`

const getGroup = (record) => record.batch ?? `subagent-${record.approach}`

const getUnitKey = (record) => record.group ? `${getGroup(record)}|${record.condition}` : record.id

const getInputProcessed = ({ tokens }) => tokens.input + tokens.cacheCreation + tokens.cacheRead

const getUncachedInput = ({ tokens }) => tokens.input + tokens.cacheCreation

const getContextSizes = (unit) => unit.records.map((record) => record.transcript.contextSize)

const getOutputSpeed = ({ tokens, durationMs }) => tokens.output / (durationMs / 1000)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readRecords = () => {
  const names = readdirSync(RUNS_DIR).filter((name) => /^r\d+\.json$/.test(name)).sort()
  const records = names.map((name) => readJson(join(RUNS_DIR, name)))

  return records.filter((record) => record.score && !SKIPPED_GROUPS.includes(getGroup(record)))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const mergeTranscripts = (transcripts) => {
  const tokens = Object.fromEntries(TOKEN_KEYS.map((key) => [key, getSum(transcripts.map((t) => t.tokens[key]))]))
  const durations = transcripts.map((transcript) => transcript.durationMs)
  const efforts = [...new Set(transcripts.flatMap((transcript) => transcript.efforts ?? ['max']))]
  const models = [...new Set(transcripts.flatMap((transcript) => transcript.models))]

  const toolCalls = transcripts.flatMap((transcript) => transcript.toolCalls)

  return { tokens, models, efforts, durationMs: getSum(durations), wallMs: Math.max(...durations), toolCalls }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const mergeCli = (clis) => {
  if (clis.some((cli) => !cli)) return undefined

  const speed = [...new Set(clis.map((cli) => cli.speed))].join(', ')
  const utilization = clis.map((cli) => cli.fiveHourUtilization).filter((value) => value != null)

  const costs = clis.map((cli) => cli.costUsd).filter((cost) => cost != null)

  return { speed, costUsd: costs.length ? getSum(costs) : undefined, fiveHourUtilization: utilization }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const finishUnit = (unit) => {
  const scores = unit.records.map((record) => record.score)
  const score = Object.fromEntries(SCORE_LISTS.map((key) => [key, scores.flatMap((each) => each[key])]))
  const transcript = mergeTranscripts(unit.records.map((record) => record.transcript))
  const cli = mergeCli(unit.records.map((record) => record.cli))
  const compliance = unit.records.flatMap((record) => record.compliance)

  score.detected = score.realFails.length ? score.caught.length > 0 : null

  return { ...unit, score, transcript, cli, compliance }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const collapseUnits = (records) => {
  const units = new Map()

  for (const record of records) {
    const key = getUnitKey(record)
    const unit = units.get(key) ?? { group: getGroup(record), bug: record.bug, records: [] }

    unit.records.push(record)
    units.set(key, unit)
  }

  return [...units.values()].map(finishUnit)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listGroups = (units) => {
  const present = new Set(units.map((unit) => unit.group))
  const extra = [...present].filter((group) => !GROUP_ORDER.includes(group))

  return [...GROUP_ORDER.filter((group) => present.has(group)), ...extra]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatCell = (units) => {
  if (!units.length) return '-'

  return units.map(({ score }) => {
    if (score.detected == null) return score.agentFails.length ? `${score.agentFails.length} false` : 'all pass'

    return `${score.detected ? 'yes' : 'no'} ${score.caught.length}/${score.realFails.length}, +${score.extra.length}`
  }).join('; ')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printBugTable = (units, groups) => {
  console.log(`| bug | real suite | ${groups.join(' | ')} |`)
  console.log(`| --- | --- | ${groups.map(() => '---').join(' | ')} |`)

  for (const bug of BUG_NAMES) {
    const real = readJson(join(REAL_DIR, `${bug}.json`))
    const realFails = Object.values(real.results).filter((result) => result === 'fail').length
    const realCell = real.crashed ? 'crash' : real.loadFailed ? 'fails to load' : String(realFails)
    const cells = groups.map((group) => formatCell(units.filter((unit) => unit.bug === bug && unit.group === group)))

    console.log(`| ${bug} | ${realCell} | ${cells.join(' | ')} |`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const summarizeCli = (units) => {
  const clis = units.map((unit) => unit.cli).filter(Boolean)

  if (!clis.length) return { cost: '-', fiveHour: '-', speed: 'standard' }

  const usage = clis.flatMap((cli) => cli.fiveHourUtilization)
  const [low, high] = [Math.min(...usage), Math.max(...usage)].map((value) => Math.round(value * 100))
  const speed = [...new Set(clis.map((cli) => cli.speed))].join(', ')

  const costs = clis.map((cli) => cli.costUsd).filter((cost) => cost != null)
  const cost = costs.length ? `$${getSum(costs).toFixed(2)}` : '-'

  return { cost, fiveHour: `${low}% to ${high}%`, speed }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const summarizeGroup = (units) => {
  const bugUnits = units.filter(({ score }) => score.detected != null)
  const cleanUnits = units.filter(({ score }) => score.detected == null)
  const recall = bugUnits.map(({ score }) => score.caught.length / score.realFails.length)
  const transcripts = units.map((unit) => unit.transcript)
  const cli = summarizeCli(units)

  return {
    conditions: units.length,
    agents: getSum(units.map((unit) => unit.records.length)),
    model: [...new Set(transcripts.flatMap((transcript) => transcript.models))].join(', '),
    effort: [...new Set(transcripts.flatMap((transcript) => transcript.efforts))].join(', '),
    detected: `${bugUnits.filter(({ score }) => score.detected).length}/${bugUnits.length}`,
    recall: bugUnits.length ? `${Math.round(getSum(recall) / recall.length * 100)}%` : '-',
    extra: getSum(bugUnits.map(({ score }) => score.extra.length)),
    cleanFails: getSum(cleanUnits.map(({ score }) => score.agentFails.length)),
    agentTime: formatMinutes(getMedian(transcripts.map((transcript) => transcript.durationMs))),
    wallTime: formatMinutes(getMedian(transcripts.map((transcript) => transcript.wallMs))),
    output: formatThousands(getMedian(transcripts.map((transcript) => transcript.tokens.output))),
    input: formatThousands(getMedian(transcripts.map(getInputProcessed))),
    uncachedInput: formatThousands(getMedian(transcripts.map(getUncachedInput))),
    context: formatThousands(getMedian(units.flatMap(getContextSizes))),
    outputSpeed: Math.round(getMedian(transcripts.map(getOutputSpeed))),
    tools: getMedian(transcripts.map((transcript) => transcript.toolCalls.length)),
    cost: cli.cost,
    fiveHour: cli.fiveHour,
    flagged: units.filter(({ compliance }) => compliance.length).length,
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printGroupTable = (units, groups) => {
  const header = [
    'batch', 'conditions', 'agents', 'model', 'effort', 'bugs detected', 'mean recall', 'extra fails',
    'clean-run fails', 'median agent time per condition', 'median wall time per condition', 'median output',
    'median input', 'median uncached input', 'median final context', 'median output tokens/s', 'median tools',
    'reported cost', '5h window', 'rule flags',
  ]

  console.log(`| ${header.join(' | ')} |`)
  console.log(`| ${header.map(() => '---').join(' | ')} |`)

  for (const group of groups) {
    const summary = summarizeGroup(units.filter((unit) => unit.group === group))

    console.log(`| ${group} | ${Object.values(summary).join(' | ')} |`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const units = collapseUnits(readRecords())
  const groups = listGroups(units)

  printBugTable(units, groups)
  console.log()
  printGroupTable(units, groups)
}

main()
