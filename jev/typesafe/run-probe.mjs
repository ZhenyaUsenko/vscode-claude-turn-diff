import { REPO_DIR } from '../lib/paths.mjs'
import { formatAnswer } from '../lib/render.mjs'
import { buildQuestion, readContext, readSourceFiles, readTests, SOURCE_FILES } from '../lib/tests.mjs'
import { sendRequest } from './lib/client.mjs'
import { parseArgs } from 'node:util'

const ARG_OPTIONS = {
  probe: { type: 'string' },
  src: { type: 'string', default: REPO_DIR },
  context: { type: 'string', default: 'notes' },
  label: { type: 'string', default: 'probe' },
  model: { type: 'string', default: 'jev-latest' },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findTest = (suites, id) => suites.flatMap((suite) => suite.tests).find((test) => test.id === id)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })
  const { probe } = await import(`./probes/${options.probe}.mjs`)
  const test = findTest(readTests('behavior-tests.md'), probe.test)
  const statement = test.behavior
  const state = { context: readContext(options.context), statement, files: readSourceFiles(options.src, SOURCE_FILES) }
  const questions = { original_inline: buildQuestion(test), ...probe.questions }
  const body = { state, model: options.model, questions }
  const result = await sendRequest('/systemone', body, `probe-${options.label}-${options.probe}`)

  console.log(`${probe.test}: ${statement}`)
  console.log()

  for (const [id, answer] of Object.entries(result.answers)) console.log(`  ${id.padEnd(28)} ${formatAnswer(answer)}`)

  console.log()
  console.log(`${result.model}, ${result.usage.input_tokens} input tokens, ${result.elapsedMs}ms`)
}

main()
