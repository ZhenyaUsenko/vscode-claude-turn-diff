import { sendRequest } from './lib/client.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { buildRequests, readTests } from './lib/tests.mjs'
import { parseArgs } from 'node:util'

const PASS_THRESHOLD = 0.5
const USD_PER_TOKEN = 0.042 / 1e6

const ARG_OPTIONS = {
  src: { type: 'string', default: REPO_DIR },
  files: { type: 'string', default: 'all' },
  context: { type: 'string', default: 'none' },
  label: { type: 'string', default: 'baseline' },
  tests: { type: 'string', default: 'tests.md' },
  model: { type: 'string', default: 'jev-latest' },
  dry: { type: 'boolean', default: false },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatPercent = (value) => `${Math.round(value * 100)}%`.padStart(4)

const getMean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const postRequest = async (request, label) => {
  const result = await sendRequest('/systemone', request.body, `tests-${label}-${request.name}`)

  return { ...result, name: request.name }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printDryRun = (requests) => {
  for (const request of requests) {
    const questionCount = Object.keys(request.body.questions).length
    const stateChars = JSON.stringify(request.body.state).length
    const totalChars = JSON.stringify(request.body).length

    console.log(`${request.name}: ${questionCount} questions, state ${stateChars} chars, request ${totalChars} chars`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printAnswers = (suites, answers) => {
  for (const suite of suites) {
    const nouls = suite.tests.map((test) => answers[test.id].noul)
    const passCount = nouls.filter((noul) => noul >= PASS_THRESHOLD).length

    console.log(`--- ${suite.name}: ${passCount}/${suite.tests.length} pass, mean ${formatPercent(getMean(nouls))}`)

    for (const test of suite.tests) {
      const noul = answers[test.id].noul

      console.log(`  ${noul >= PASS_THRESHOLD ? 'pass' : 'FAIL'}  ${formatPercent(noul)}  ${test.id}`)
    }
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printSummary = (answers, results) => {
  const nouls = Object.values(answers).map((answer) => answer.noul)
  const passCount = nouls.filter((noul) => noul >= PASS_THRESHOLD).length
  const meanNoul = getMean(nouls)
  const minNoul = Math.min(...nouls)
  const totalTokens = results.reduce((sum, result) => sum + result.usage.input_tokens, 0)
  const timings = results.map((result) => `${result.name} ${result.elapsedMs}ms/${result.usage.input_tokens}tok`)

  console.log(`=== ${passCount}/${nouls.length} pass, mean ${formatPercent(meanNoul)}, min ${formatPercent(minNoul)}`)
  console.log(`=== ${results[0].model}, ${totalTokens} input tokens, $${(totalTokens * USD_PER_TOKEN).toFixed(4)}`)
  console.log(`=== ${timings.join(', ')}`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })
  const suites = readTests(options.tests)
  const requests = buildRequests(suites, options)

  if (options.dry) return void printDryRun(requests)

  const results = await Promise.all(requests.map((request) => postRequest(request, options.label)))
  const answers = Object.assign({}, ...results.map((result) => result.answers))

  printAnswers(suites, answers)
  printSummary(answers, results)
}

main()
