const assert = require('assert')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-diff-test-'))

process.env.HOME = HOME

const Module = require('module')
const vscode = require('./vscode-stub')

const loadModule = Module._load

Module._load = (request, ...rest) => request === 'vscode' ? vscode : loadModule.call(Module, request, ...rest)

const turn = require('../src/turn')
const paths = require('../src/util/paths')
const view = require('../src/view')

const { projectKey } = paths

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const registered = []

const check = (name, body) => registered.push({ name, body })

const run = async () => {
  let failed = 0

  for (const { name, body } of registered) {
    try {
      await body()

      console.log(`  ok    ${name}`)
    } catch (error) {
      failed++

      console.log(`  FAIL  ${name}\n        ${error.message}`)
    }
  }

  fs.rmSync(HOME, { recursive: true, force: true })
  console.log(failed ? `\n  ${failed} failing` : `\n  all ${registered.length} passing`)
  process.exit(failed ? 1 : 0)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let counter = 0

const repoAt = () => {
  const dir = path.join(HOME, 'work', `repo${counter++}`)

  fs.mkdirSync(dir, { recursive: true })

  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })

  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')

  return dir
}

const commitAll = (dir) => {
  execFileSync('git', ['-C', dir, 'add', '-A'], { stdio: 'ignore' })
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'fixture'], { stdio: 'ignore' })
}

const write = (file, contents) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, contents)
}

const registerChat = (directory, sessionId) => {
  const dir = path.join(HOME, '.claude', 'projects', projectKey(directory))

  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), '')
}

const forgetChat = (directory, sessionId) => {
  const dir = path.join(HOME, '.claude', 'projects', projectKey(directory))

  fs.unlinkSync(path.join(dir, `${sessionId}.jsonl`))
}

const manifest = (directory) => JSON.parse(fs.readFileSync(paths.manifestFor(projectKey(directory)), 'utf8'))

const statuses = (directory) => {
  const labels = manifest(directory).files.map((entry) => `${entry[3]} ${path.basename(entry[0])}`)

  return labels.sort()
}

const nextSecond = () => new Promise((resolve) => setTimeout(resolve, 1100))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runTurn = async (directory, sessionId, folders, mutate, { prompt = 'p', touch = [] } = {}) => {
  const project = projectKey(directory)

  registerChat(directory, sessionId)

  await turn.handle('begin', project, { session_id: sessionId, prompt }, folders)
  await turn.handle('arm', project, { session_id: sessionId }, folders)

  for (const file of touch) {
    const payload = { session_id: sessionId, tool_input: { file_path: file } }

    await turn.handle('arm', project, payload, folders)
  }

  mutate()

  await turn.handle('end', project, { session_id: sessionId }, folders)
}

module.exports = {
  assert,
  fs,
  path,
  HOME,
  turn,
  paths,
  check,
  run,
  repoAt,
  commitAll,
  write,
  registerChat,
  forgetChat,
  manifest,
  nextSecond,
  runTurn,
  statuses,
  projectKey,
  view,
  vscode,
}
