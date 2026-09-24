import { RUNS_DIR } from '../lib/paths.mjs'
import { findTranscriptFile } from '../lib/transcript.mjs'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIN_OUTPUT_TOKENS = 2000

const CONCURRENCY_BUCKETS = [[1, 2], [3, 6], [7, 12], [13, 20]]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

const getMedian = (values) => values.toSorted((a, b) => a - b)[Math.floor((values.length - 1) / 2)]

const formatClock = (time) => new Date(time).toLocaleTimeString('en-GB')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readEntries = (record) => {
  const keptFile = join(RUNS_DIR, record.id, 'transcript.jsonl')
  const transcriptFile = existsSync(keptFile) ? keptFile : findTranscriptFile(record.agentId)
  const lines = readFileSync(transcriptFile, 'utf8').split('\n').filter(Boolean)

  return lines.map((line) => JSON.parse(line)).filter((entry) => entry.timestamp)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listRequests = (entries) => {
  const requests = new Map()

  entries.forEach((entry, index) => {
    if (entry.type !== 'assistant') return

    const request = requests.get(entry.requestId) ?? { startedAt: Date.parse(entries[index - 1].timestamp) }

    request.endedAt = Date.parse(entry.timestamp)
    request.output = entry.message.usage.output_tokens
    requests.set(entry.requestId, request)
  })

  return [...requests.values()]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readRuns = (agentIds) => {
  const names = readdirSync(RUNS_DIR).filter((name) => /^r\d+\.json$/.test(name)).sort()
  const records = names.map((name) => readJson(join(RUNS_DIR, name)))

  return records.filter((record) => agentIds[record.id]).map((record) => {
    const entries = readEntries({ ...record, agentId: agentIds[record.id] })
    const times = entries.map((entry) => Date.parse(entry.timestamp))

    const span = { startedAt: Math.min(...times), endedAt: Math.max(...times) }

    return { id: record.id, approach: record.approach, ...span, requests: listRequests(entries) }
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const countRunning = (runs, time) => {
  return runs.filter((run) => run.startedAt <= time && time <= run.endedAt).length
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printStarts = (runs) => {
  for (const run of runs) {
    const span = `${formatClock(run.startedAt)} to ${formatClock(run.endedAt)}`

    console.log(`${run.id} ${run.approach.padEnd(6)} ${span}`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const measureRequest = (runs, request) => {
  const concurrency = countRunning(runs, (request.startedAt + request.endedAt) / 2)
  const tokensPerSecond = request.output / ((request.endedAt - request.startedAt) / 1000)

  return { concurrency, tokensPerSecond }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printSpeedByConcurrency = (runs) => {
  const allRequests = runs.flatMap((run) => run.requests)
  const requests = allRequests.filter((request) => request.output >= MIN_OUTPUT_TOKENS)
  const samples = requests.map(measureRequest.bind(null, runs))

  for (const [low, high] of CONCURRENCY_BUCKETS) {
    const bucket = samples.filter(({ concurrency }) => concurrency >= low && concurrency <= high)
    const speeds = bucket.map((sample) => sample.tokensPerSecond)

    if (!speeds.length) continue

    const median = getMedian(speeds).toFixed(0)

    console.log(`${low}-${high} agents running: ${speeds.length} requests, median ${median} output tokens/s`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const lines = readFileSync(process.argv[2], 'utf8').trim().split('\n')
  const agentIds = Object.fromEntries(lines.map((line) => line.split(' ')))
  const runs = readRuns(agentIds).sort((a, b) => a.startedAt - b.startedAt)

  printStarts(runs)
  console.log()
  printSpeedByConcurrency(runs)
}

main()
