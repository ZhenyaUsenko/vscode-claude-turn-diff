import { BUGS } from './bugs.mjs'
import { LOGS_DIR, REAL_DIR, RUNS_DIR } from './paths.mjs'
import { renderRun } from './render-run.mjs'
import { checkCompliance, parseVerdicts, scoreRun } from './score.mjs'
import { parseStream } from './stream.mjs'
import { readTests } from './tests.mjs'
import { findTranscriptFile, parseTranscript } from './transcript.mjs'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const pad2 = (value) => String(value).padStart(2, '0')

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatStamp = (date) => {
  const day = `${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
  const time = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`

  return `${day}-${time}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildRecord = (run, source) => {
  const transcriptFile = source.transcriptFile ?? findTranscriptFile(source.agentId)

  if (!transcriptFile) throw new Error(`no transcript for run ${run.id}`)

  const keptTranscriptFile = join(RUNS_DIR, run.id, 'transcript.jsonl')
  const transcript = parseTranscript(transcriptFile)
  const suites = readTests('behavior-tests.md').filter((suite) => !run.group || suite.name === run.group)
  const testIds = suites.flatMap((suite) => suite.tests.map((test) => test.id))
  const { verdicts, ranIds } = parseVerdicts(transcript.finalText)
  const real = readJson(join(REAL_DIR, `${run.bug}.json`))
  const score = scoreRun(testIds, verdicts, real)
  const compliance = checkCompliance(run, transcript.toolCalls)
  const cli = source.streamFile ? parseStream(source.streamFile) : undefined

  if (transcriptFile !== keptTranscriptFile) copyFileSync(transcriptFile, keptTranscriptFile)

  const summary = BUGS[run.bug]?.summary ?? 'no bug, the code as it is in the repository'
  const recorded = { summary, agentId: source.agentId, recordedAt: new Date().toISOString(), keptTranscriptFile }

  const judged = { verdicts, ranIds, real, score, compliance, testIds }

  return { ...run, ...recorded, harness: source.harness ?? {}, cli, transcript, ...judged }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const recordRun = (runId, source) => {
  const run = readJson(join(RUNS_DIR, `${runId}.json`))
  const record = buildRecord(run, source)
  const stamp = formatStamp(new Date(record.recordedAt))
  const logName = `${stamp}-claude-${record.id}-${record.batch ?? record.approach}-${record.bug}.md`

  writeFileSync(join(RUNS_DIR, `${run.id}.json`), JSON.stringify(record, null, 2))
  mkdirSync(LOGS_DIR, { recursive: true })
  writeFileSync(join(LOGS_DIR, logName.replace(/\s+/g, '-')), renderRun(record))

  return record
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const formatSummary = (record) => {
  const { score, transcript } = record
  const minutes = (transcript.durationMs / 60000).toFixed(1)
  const detection = score.detected == null ? 'clean' : score.detected ? 'DETECTED' : 'missed'
  const counts = `real ${score.realFails.length}, agent ${score.agentFails.length}, caught ${score.caught.length}`
  const extras = `extra ${score.extra.length}, unanswered ${score.unanswered.length}`
  const usage = `${minutes}m, ${transcript.toolCalls.length} tools, output ${transcript.tokens.output}`
  const flags = record.compliance.length ? `; ${record.compliance.length} rule flags` : ''

  const label = `${record.id} ${record.batch ?? record.approach} ${record.bug}`

  return `${label}: ${detection}; ${counts}, ${extras}; ${usage}${flags}`
}
