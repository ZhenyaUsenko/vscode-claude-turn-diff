import { BUG_NAMES } from '../lib/bugs.mjs'
import { REAL_DIR } from '../lib/paths.mjs'
import { runRealSuite } from '../lib/real.mjs'
import { readTests } from '../lib/tests.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatRun = (run) => {
  const failedIds = Object.keys(run.results).filter((id) => run.results[id] === 'fail')
  const outcome = run.crashed ? `crashed, exit ${run.exitCode}` : `${failedIds.length} failing`
  const listed = run.crashed ? run.stderrHead.split('\n').find((line) => line.includes('Error')) : failedIds.join(', ')

  return `${run.bug.padEnd(20)} ${outcome.padEnd(18)} ${String(run.durationMs).padStart(6)}ms  ${listed ?? ''}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const bugs = process.argv.length > 2 ? process.argv.slice(2) : BUG_NAMES
  const suites = readTests('behavior-tests.md')

  mkdirSync(REAL_DIR, { recursive: true })

  for (const bug of bugs) {
    const run = await runRealSuite(bug, suites)

    writeFileSync(join(REAL_DIR, `${bug}.json`), JSON.stringify(run, null, 2))
    console.log(formatRun(run))
  }
}

main()
