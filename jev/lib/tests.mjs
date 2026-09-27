import { REPO_DIR, TESTS_DIR } from './paths.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const QUESTION = 'Does the program in `files` behave as `behavior` describes?'

const CRITERIA = {
  true: 'The code as written behaves this way',
  false: 'The code as written does not behave this way',
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

const TEST_LINE = /^`([A-Z][A-Za-z]*): ([^`]+)` (.+)$/

const HEADING = /^#{1,6} /

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findSuite = (parsed, area) => {
  const existing = parsed.suites.find((suite) => suite.area === area)

  if (existing) return existing

  const suite = { name: area.toLowerCase(), area, tests: [] }

  parsed.suites.push(suite)

  return suite
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const startTest = (parsed, [, area, name, text]) => {
  const suite = findSuite(parsed, area)
  const id = `${area}: ${name}`

  if (suite.tests.some((test) => test.id === id)) throw new Error(`duplicate test id: ${id}`)

  parsed.test = { id, behavior: text.trim() }
  parsed.inParagraph = true

  suite.tests.push(parsed.test)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const addBehaviorLine = (parsed, line) => {
  const { behavior } = parsed.test

  if (parsed.inParagraph) {
    parsed.test.behavior = `${behavior} ${line.trim()}`
  } else {
    parsed.test.behavior = `${behavior}\n\n${line.trim()}`
  }

  parsed.inParagraph = true
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const parseTestLine = (line, parsed) => {
  const testMatch = line.match(TEST_LINE)

  if (testMatch) {
    startTest(parsed, testMatch)
  } else if (HEADING.test(line)) {
    parsed.test = null
  } else if (!line) {
    parsed.inParagraph = false
  } else if (parsed.test) {
    addBehaviorLine(parsed, line)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const parseTests = (markdown) => {
  const lines = markdown.split('\n').map((line) => line.trimEnd())
  const areas = new Set(lines.map((line) => line.match(TEST_LINE)?.[1]).filter(Boolean))
  const introEnd = lines.findIndex((line) => line.startsWith('## ') && areas.has(line.slice(3)))
  const parsed = { suites: [], test: null, inParagraph: false }

  for (const line of lines.slice(introEnd)) parseTestLine(line, parsed)

  return { intro: lines.slice(0, introEnd).join('\n').trim(), suites: parsed.suites }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readContext = (mode) => {
  if (mode === 'none') return undefined
  if (mode === 'technical') return { technical_notes: readFileSync(join(REPO_DIR, 'TECHNICAL.md'), 'utf8') }
  if (mode === 'suite') return readFileSync(join(TESTS_DIR, 'context-notes-suite.md'), 'utf8')

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

export const toQuestionKey = (id) => id.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const buildQuestion = (test) => {
  return { type: 'noul', instructions: { behavior: test.behavior, question: QUESTION }, criteria: CRITERIA }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readTestFile = (testsFile) => parseTests(readFileSync(join(TESTS_DIR, testsFile), 'utf8'))

export const readTests = (testsFile) => readTestFile(testsFile).suites

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const buildRequests = (suites, options) => {
  const state = { context: readContext(options.context), files: readSourceFiles(options.src, SOURCE_FILES) }
  const tests = suites.flatMap((suite) => suite.tests)
  const questions = Object.fromEntries(tests.map((test) => [toQuestionKey(test.id), buildQuestion(test)]))

  return [{ name: 'all', body: { state, model: options.model, questions } }]
}
