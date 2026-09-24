import { fence } from './render.mjs'
import { readContext, readSourceFile, readTestFile, SOURCE_FILES } from './tests.mjs'
import { extname } from 'node:path'

const PROMPT_FILES = ['package.json', ...SOURCE_FILES]

const LANGUAGES = { '.js': 'js', '.json': 'json', '.sh': 'bash' }

const TITLE_LINE = /^# .*\n+/

const HEADER = [
  '# Behavior test run',
  '',
  'Background describes the tools the extension works with, Source holds the full code under test, and Tests lists ' +
  'the behaviors to judge, each under its id.',
].join('\n')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderSourceFile = (srcDir, path) => {
  return `## ${path}\n\n${fence(readSourceFile(srcDir, path), LANGUAGES[extname(path)])}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderSource = (srcDir) => {
  const note = `The code under test, read from \`${srcDir}\`. Separator comment lines are left out.`

  return ['# Source', note, ...PROMPT_FILES.map((path) => renderSourceFile(srcDir, path))].join('\n\n')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderSuite = (suite) => {
  const tests = suite.tests.map((test) => `### ${test.id}\n\n${test.behavior}`)

  return [`## ${suite.name}`, ...tests].join('\n\n')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderTests = (testsFile, group) => {
  const { intro, suites } = readTestFile(testsFile)
  const selected = group ? suites.filter((suite) => suite.name === group) : suites

  if (!selected.length) throw new Error(`no test group ${group}`)

  return ['# Tests', intro.replace(TITLE_LINE, ''), ...selected.map(renderSuite)].join('\n\n')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const buildPrompt = (srcDir, testsFile, group) => {
  const sections = [HEADER, readContext('notes').trim(), renderSource(srcDir), renderTests(testsFile, group)]

  return `${sections.join('\n\n')}\n`
}
