import { applyBug } from './bugs.mjs'
import { REPO_DIR } from './paths.mjs'
import { execFile } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const COPIED_PATHS = ['package.json', 'src', 'hooks', 'test']

const LOAD_CHECK_FILE = new URL('./load-check.mjs', import.meta.url).pathname

const RESULT_LINE = /^ {2}(ok|FAIL) {2,4}(.+)$/

const SUMMARY_LINE = /^ {2}(all \d+ passing|\d+ failing)$/

const ERROR_LINE = /^[A-Z]\w*Error\b/

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readCheckNames = (testFile) => {
  const matches = readFileSync(testFile, 'utf8').matchAll(/check\('((?:[^'\\]|\\.)*)'/g)

  return [...matches].map((match) => match[1].replace(/\\(.)/g, '$1'))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const mapCheckNames = (suites) => {
  const idsByName = new Map()

  for (const suite of suites) {
    const names = readCheckNames(join(REPO_DIR, 'test', 'cases', `${suite.name}.test.js`))
    const mismatch = `${suite.name}: ${names.length} checks, ${suite.tests.length} tests`

    if (names.length !== suite.tests.length) throw new Error(mismatch)

    names.forEach((name, index) => idsByName.set(name, suite.tests[index].id))
  }

  return idsByName
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runSuite = (workDir) => {
  const startedAt = performance.now()
  const args = ['--import', './test/setup.js', 'test/index.js']

  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: workDir, maxBuffer: 1 << 24 }, (error, stdout, stderr) => {
      resolve({ exitCode: error?.code ?? 0, stdout, stderr, durationMs: Math.round(performance.now() - startedAt) })
    })
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findErrorLine = (stderr) => {
  const lines = stderr.split('\n').map((line) => line.trim())

  return lines.find((line) => ERROR_LINE.test(line) && !line.startsWith('Error: Command failed')) ?? lines[0]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runLoadCheck = (workDir) => {
  return new Promise((resolve) => {
    execFile(process.execPath, [LOAD_CHECK_FILE, workDir], { timeout: 30000 }, (error, stdout, stderr) => {
      resolve(error ? findErrorLine(stderr) : null)
    })
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const parseOutput = (stdout, idsByName) => {
  const lines = stdout.split('\n')
  const results = {}
  const messages = {}
  const unmapped = {}

  lines.forEach((line, index) => {
    const match = line.match(RESULT_LINE)

    if (!match) return

    const name = match[2].trim()
    const id = idsByName.get(name)
    const verdict = match[1] === 'ok' ? 'pass' : 'fail'

    if (!id) return void (unmapped[name] = verdict)

    results[id] = verdict

    if (verdict === 'fail') messages[id] = lines[index + 1]?.trim()
  })

  return { results, messages, unmapped, finished: lines.some((line) => SUMMARY_LINE.test(line)) }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const runRealSuite = async (bug, suites) => {
  const workDir = mkdtempSync(join(tmpdir(), `real-${bug}-`))

  for (const path of COPIED_PATHS) cpSync(join(REPO_DIR, path), join(workDir, path), { recursive: true })

  applyBug(workDir, bug)

  const run = await runSuite(workDir)
  const loadError = await runLoadCheck(workDir)
  const idsByName = mapCheckNames(suites)
  const { results, messages, unmapped, finished } = parseOutput(run.stdout, idsByName)
  const testIds = suites.flatMap((suite) => suite.tests.map((test) => test.id))
  const loadFailed = !finished || loadError != null

  rmSync(workDir, { recursive: true, force: true })

  if (!finished) for (const id of testIds) results[id] ??= 'fail'

  const stderrHead = run.stderr.split('\n').slice(0, 6).join('\n')
  const outcome = { exitCode: run.exitCode, durationMs: run.durationMs, crashed: !finished, loadFailed, loadError }

  return { bug, ...outcome, results, messages, unmapped, stderrHead }
}
