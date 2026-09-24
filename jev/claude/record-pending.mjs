import { RUNS_DIR } from '../lib/paths.mjs'
import { formatSummary, recordRun } from '../lib/record.mjs'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const ARG_OPTIONS = { runs: { type: 'string' }, 'poll-seconds': { type: 'string', default: '15' } }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isRunning = (sessionId) => {
  try { execFileSync('pgrep', ['-f', sessionId], { stdio: 'ignore' }) } catch { return false }

  return true
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getTranscriptFile = ({ cwd, sessionId }) => {
  const projectKey = realpathSync(cwd).replace(/[^a-zA-Z0-9]/g, '-')

  return join(homedir(), '.claude', 'projects', projectKey, `${sessionId}.jsonl`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const recordFinished = (run) => {
  try {
    const streamFile = join(RUNS_DIR, run.id, 'cli-stream.jsonl')
    const record = recordRun(run.id, { transcriptFile: getTranscriptFile(run.cliLaunch), streamFile })

    console.log(`${formatSummary(record)} (5h ${record.cli.fiveHourUtilization})`)
  } catch (error) {
    console.log(`${run.id}: not recorded: ${error.message}`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })
  const pending = options.runs.split(',').map((runId) => readJson(join(RUNS_DIR, `${runId}.json`)))

  console.log(`waiting for ${pending.length} runs: ${pending.map((run) => run.id).join(', ')}`)

  while (pending.length) {
    const finished = pending.filter((run) => !isRunning(run.cliLaunch.sessionId))

    for (const run of finished) {
      recordFinished(run)
      pending.splice(pending.indexOf(run), 1)
    }

    if (pending.length) await sleep(Number(options['poll-seconds']) * 1000)
  }
}

main()
