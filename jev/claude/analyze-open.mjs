import { RUNS_DIR } from '../lib/paths.mjs'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SKIPPED_DIRS = /(^|\/)(home[^/]*|work[^/]*|tmp|repos?|dirs|fixtures?|node_modules)(\/|$)/

const SCRIPT_FILE = /\.(mjs|js|cjs|sh)$/

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listScripts = (scratchDir) => {
  const names = readdirSync(scratchDir, { recursive: true }).map(String)
  const scripts = names.filter((name) => SCRIPT_FILE.test(name) && !SKIPPED_DIRS.test(name))

  return scripts.filter((name) => statSync(join(scratchDir, name)).isFile())
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const summarizeRun = (record) => {
  const scripts = listScripts(record.scratchDir)
  const contents = scripts.map((name) => readFileSync(join(record.scratchDir, name), 'utf8'))
  const lineCount = contents.reduce((sum, text) => sum + text.split('\n').length, 0)
  const hasStub = contents.some((text) => /createFileSystemWatcher|registerFileSystemProvider/.test(text))
  const bashCommands = record.transcript.toolCalls.filter((call) => call.name === 'Bash').map((call) => call.summary)
  const nodeRuns = bashCommands.filter((command) => /\bnode\b/.test(command) && !command.includes('build-prompt.mjs'))
  const ceiling = bashCommands.some((command) => command.includes('GIT_CEILING_DIRECTORIES'))
  const readCalls = record.transcript.toolCalls.filter((call) => call.name === 'Read').length

  return {
    run: `${record.id} ${record.bug}`,
    tools: record.transcript.toolCalls.length,
    reads: readCalls,
    nodeRuns: nodeRuns.length,
    scripts: scripts.length,
    lines: lineCount,
    stub: hasStub ? 'yes' : 'no',
    ranIds: record.ranIds.length,
    ceiling: ceiling ? 'yes' : 'no',
    minutes: (record.transcript.durationMs / 60000).toFixed(1),
    names: scripts.map((name) => relative('.', name)).join(' '),
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const batch = process.argv[2]
  const names = readdirSync(RUNS_DIR).filter((name) => /^r\d+\.json$/.test(name)).sort()
  const records = names.map((name) => readJson(join(RUNS_DIR, name)))
  const openRecords = records.filter((record) => record.approach === 'open' && record.score)
  const rows = openRecords.filter((record) => !batch || record.batch === batch).map(summarizeRun)
  const columns = ['run', 'tools', 'reads', 'nodeRuns', 'scripts', 'lines', 'stub', 'ranIds', 'ceiling', 'minutes']

  console.log(`| ${columns.join(' | ')} |`)
  console.log(`| ${columns.map(() => '---').join(' | ')} |`)

  for (const row of rows) console.log(`| ${columns.map((column) => row[column]).join(' | ')} |`)

  console.log()

  for (const row of rows) console.log(`${row.run}: ${row.names}`)
}

main()
