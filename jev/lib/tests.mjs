import { JEV_DIR, REPO_DIR } from './paths.mjs'
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

const parseTestLine = (line, parsed) => {
  const keyMatch = line.match(/^(behavior|scenario|expected|notes):\s*(.*)$/)

  if (line.startsWith('# ')) {
    parsed.suite = { name: line.slice(2), files: [], tests: [] }
    parsed.test = null
    parsed.key = null

    parsed.suites.push(parsed.suite)
  } else if (line.startsWith('## ')) {
    parsed.test = { id: `${parsed.suite.name}.${line.slice(3)}` }
    parsed.key = null

    parsed.suite.tests.push(parsed.test)
  } else if (line.startsWith('files:')) {
    parsed.suite.files = line.slice(6).trim().split(/\s+/)
  } else if (keyMatch) {
    parsed.key = keyMatch[1]
    parsed.test[parsed.key] = keyMatch[2]
  } else if (!line) {
    parsed.key = null
  } else if (parsed.key) {
    parsed.test[parsed.key] += ` ${line.trim()}`
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const parseTests = (markdown) => {
  const parsed = { suites: [], suite: null, test: null, key: null }

  for (const line of markdown.split('\n')) parseTestLine(line.trimEnd(), parsed)

  return parsed.suites
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const parseNotes = (markdown) => {
  let section

  const notes = {}

  for (const line of markdown.split('\n')) {
    if (line.startsWith('# ')) {
      section = line.slice(2)
      notes[section] = []
    } else if (line.trim()) {
      notes[section].push(line.trim())
    }
  }

  return notes
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readContext = (mode) => {
  if (mode === 'none') return undefined
  if (mode === 'technical') return { technical_notes: readFileSync(join(REPO_DIR, 'TECHNICAL.md'), 'utf8') }

  return parseNotes(readFileSync(join(JEV_DIR, 'context-notes.md'), 'utf8'))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const stripSeparators = (contents) => {
  const lines = contents.split('\n').filter((line) => !/^\/{10,}$/.test(line))

  return lines.join('\n').replace(/\n{3,}/g, '\n\n')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readSourceFile = (srcDir, path) => stripSeparators(readFileSync(join(srcDir, path), 'utf8'))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readSourceFiles = (srcDir, paths) => {
  return Object.fromEntries(paths.map((path) => [path, readSourceFile(srcDir, path)]))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const buildQuestion = (test, files) => {
  const kind = test.behavior ? 'behavior' : 'scenario'
  const instructions = {
    behavior: test.behavior,
    scenario: test.scenario,
    expected: test.expected,
    notes: test.notes,
    relevant_files: files,
    question: QUESTIONS[kind],
  }

  return { type: 'noul', instructions, criteria: CRITERIA[kind] }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildQuestions = (suites) => {
  const entries = suites.flatMap((suite) => suite.tests.map((test) => [test.id, buildQuestion(test, suite.files)]))

  return Object.fromEntries(entries)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readTests = (testsFile) => parseTests(readFileSync(join(JEV_DIR, testsFile), 'utf8'))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const buildRequests = (suites, options) => {
  const context = readContext(options.context)

  if (options.files === 'all') {
    const state = { context, files: readSourceFiles(options.src, SOURCE_FILES) }

    return [{ name: 'all', body: { state, model: options.model, questions: buildQuestions(suites) } }]
  }

  return suites.map((suite) => {
    const state = { context, files: readSourceFiles(options.src, suite.files) }

    return { name: suite.name, body: { state, model: options.model, questions: buildQuestions([suite]) } }
  })
}
