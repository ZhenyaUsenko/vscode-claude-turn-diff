import { REPO_DIR, TESTS_DIR } from './paths.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const QUESTIONS = {
  behavior: 'Does the program in `files` behave as `behavior` describes?',
  scenario: 'Does the program in `files` produce `expected` when `scenario` happens?',
}

const CRITERIA = {
  behavior: {
    true: 'The code as written behaves this way',
    false: 'The code as written does not behave this way',
  },
  scenario: {
    true: 'The code as written produces `expected`',
    false: 'The code as written does not produce `expected`',
  },
}

export const SOURCE_FILES = [
  'src/extension.js',
  'src/turn/index.js',
  'src/turn/capture.js',
  'src/turn/collect.js',
  'src/store/paths.js',
  'src/store/manifest.js',
  'src/store/transcript.js',
  'src/view.js',
  'src/server.js',
  'src/install/settings.js',
  'src/install/spec.js',
  'src/install/hooks.js',
  'src/utils/files.js',
  'src/utils/git.js',
  'src/utils/watch.js',
  'src/utils/workspace.js',
  'hooks/turn-diff.sh',
]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const SUITE_HEADING = /^# ([a-z][a-z0-9_]*)$/

const TEST_HEADING = /^## ([a-z][a-z0-9_]*)$/

const KEYED_LINE = /^(behavior|scenario|expected|notes):\s*(.*)$/

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const startSuite = (parsed, name) => {
  parsed.suite = { name, files: [], tests: [] }
  parsed.test = null
  parsed.key = null

  parsed.suites.push(parsed.suite)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const startTest = (parsed, name) => {
  parsed.test = { id: `${parsed.suite.name}.${name}` }
  parsed.key = null

  parsed.suite.tests.push(parsed.test)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const addBehaviorLine = (parsed, line) => {
  const { behavior } = parsed.test

  parsed.test.behavior = behavior ? `${behavior}\n\n${line.trim()}` : line.trim()
  parsed.key = 'behavior'
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const parseTestLine = (line, parsed) => {
  const suiteMatch = line.match(SUITE_HEADING)
  const testMatch = parsed.suite && line.match(TEST_HEADING)
  const keyMatch = parsed.test && line.match(KEYED_LINE)

  if (suiteMatch) {
    startSuite(parsed, suiteMatch[1])
  } else if (!parsed.suite) {
    parsed.introLines.push(line)
  } else if (testMatch) {
    startTest(parsed, testMatch[1])
  } else if (line.startsWith('files:')) {
    parsed.suite.files = line.slice(6).trim().split(/\s+/)
  } else if (keyMatch) {
    parsed.key = keyMatch[1]
    parsed.test[parsed.key] = keyMatch[2]
  } else if (!line) {
    parsed.key = null
  } else if (parsed.key) {
    parsed.test[parsed.key] += ` ${line.trim()}`
  } else if (parsed.test) {
    addBehaviorLine(parsed, line)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const parseTests = (markdown) => {
  const parsed = { introLines: [], suites: [], suite: null, test: null, key: null }

  for (const line of markdown.split('\n')) parseTestLine(line.trimEnd(), parsed)

  return { intro: parsed.introLines.join('\n').trim(), suites: parsed.suites }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readContext = (mode) => {
  if (mode === 'none') return undefined
  if (mode === 'technical') return { technical_notes: readFileSync(join(REPO_DIR, 'TECHNICAL.md'), 'utf8') }

  return readFileSync(join(TESTS_DIR, 'context-notes.md'), 'utf8')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const stripSeparators = (contents) => {
  const lines = contents.split('\n').filter((line) => !/^\/{10,}$/.test(line))

  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readSourceFile = (srcDir, path) => stripSeparators(readFileSync(join(srcDir, path), 'utf8'))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readSourceFiles = (srcDir, paths) => {
  return Object.fromEntries(paths.map((path) => [path, readSourceFile(srcDir, path)]))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const buildQuestion = (test, files) => {
  const kind = test.behavior ? 'behavior' : 'scenario'
  const instructions = { behavior: test.behavior, scenario: test.scenario, expected: test.expected, notes: test.notes }

  if (files) instructions.relevant_files = files

  instructions.question = QUESTIONS[kind]

  return { type: 'noul', instructions, criteria: CRITERIA[kind] }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildQuestions = (suites, relevantFiles) => {
  const entries = suites.flatMap((suite) => {
    return suite.tests.map((test) => [test.id, buildQuestion(test, relevantFiles ? suite.files : undefined)])
  })

  return Object.fromEntries(entries)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readTestFile = (testsFile) => parseTests(readFileSync(join(TESTS_DIR, testsFile), 'utf8'))

export const readTests = (testsFile) => readTestFile(testsFile).suites

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const buildRequests = (suites, options) => {
  const context = readContext(options.context)

  if (options.files === 'all') {
    const state = { context, files: readSourceFiles(options.src, SOURCE_FILES) }
    const questions = buildQuestions(suites, options.relevantFiles)

    return [{ name: 'all', body: { state, model: options.model, questions } }]
  }

  return suites.map((suite) => {
    const state = { context, files: readSourceFiles(options.src, suite.files) }
    const questions = buildQuestions([suite], options.relevantFiles)

    return { name: suite.name, body: { state, model: options.model, questions } }
  })
}
