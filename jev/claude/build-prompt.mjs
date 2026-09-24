import { REPO_DIR } from '../lib/paths.mjs'
import { buildPrompt } from '../lib/prompt.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const ARG_OPTIONS = {
  src: { type: 'string', default: REPO_DIR },
  out: { type: 'string' },
  tests: { type: 'string', default: 'behavior-tests.md' },
  group: { type: 'string' },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })
  const markdown = buildPrompt(resolve(options.src), options.tests, options.group)

  if (!options.out) return void process.stdout.write(markdown)

  const outFile = resolve(options.out)

  mkdirSync(dirname(outFile), { recursive: true })
  writeFileSync(outFile, markdown)
  console.log(`${outFile}\n${markdown.split('\n').length} lines, ${markdown.length} characters`)
}

main()
