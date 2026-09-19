import { sendRequest } from './lib/client.mjs'
import { REPO_DIR } from './lib/paths.mjs'
import { formatAnswer } from './lib/render.mjs'
import { buildQuestion, readContext, readSourceFiles, readTests, SOURCE_FILES } from './lib/tests.mjs'
import { parseArgs } from 'node:util'

const ARG_OPTIONS = {
  probe: { type: 'string' },
  tests: { type: 'string', default: 'behavior-tests.md' },
  src: { type: 'string', default: REPO_DIR },
  files: { type: 'string', default: 'all' },
  context: { type: 'string', default: 'notes' },
  label: { type: 'string', default: 'probe' },
  model: { type: 'string', default: 'jev-latest' },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findTest = (suites, id) => {
  const suite = suites.find((candidate) => candidate.tests.some((test) => test.id === id))

  return { suite, test: suite.tests.find((test) => test.id === id) }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getStatement = (test) => test.behavior ?? `${test.scenario} ${test.expected}`

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })
  const { probe } = await import(`./probes/${options.probe}.mjs`)
  const { suite, test } = findTest(readTests(options.tests), probe.test)
  const files = options.files === 'all' ? SOURCE_FILES : suite.files
  const statement = getStatement(test)
  const state = { context: readContext(options.context), statement, files: readSourceFiles(options.src, files) }
  const questions = { original_inline: buildQuestion(test, suite.files), ...probe.questions }
  const body = { state, model: options.model, questions }
  const result = await sendRequest('/systemone', body, `probe-${options.label}-${options.probe}`)

  console.log(`${probe.test}: ${statement}`)
  console.log()

  for (const [id, answer] of Object.entries(result.answers)) console.log(`  ${id.padEnd(28)} ${formatAnswer(answer)}`)

  console.log()
  console.log(`${result.model}, ${result.usage.input_tokens} input tokens, ${result.elapsedMs}ms`)
}

main()
