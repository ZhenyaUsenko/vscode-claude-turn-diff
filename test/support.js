import * as turn from '../src/turn/index.js'
import { manifestFor, projectKey } from '../src/util/paths.js'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const HOME = process.env.HOME

if (!HOME.startsWith(os.tmpdir())) throw new Error('run the tests through npm test, HOME must be a temp directory')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const registeredChecks = []

const check = (name, body) => registeredChecks.push({ name, body })

const run = async () => {
  let failed = 0

  for (const { name, body } of registeredChecks) {
    try {
      await body()

      console.log(`  ok    ${name}`)
    } catch (error) {
      failed++

      console.log(`  FAIL  ${name}\n        ${error.message}`)
    }
  }

  fs.rmSync(HOME, { recursive: true, force: true })
  console.log(failed ? `\n  ${failed} failing` : `\n  all ${registeredChecks.length} passing`)
  process.exit(failed ? 1 : 0)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let repoCounter = 0

const gitIn = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })

const createRepo = () => {
  const repoDir = path.join(HOME, 'work', `repo${repoCounter++}`)

  fs.mkdirSync(repoDir, { recursive: true })

  gitIn(repoDir, 'init', '-q')
  gitIn(repoDir, 'config', 'user.email', 'test@example.com')
  gitIn(repoDir, 'config', 'user.name', 'test')

  return repoDir
}

const commitAll = (dir) => {
  gitIn(dir, 'add', '-A')
  gitIn(dir, 'commit', '-qm', 'fixture')
}

const write = (file, contents) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, contents)
}

const registerChat = (dir, sessionId) => {
  const projectDir = path.join(HOME, '.claude', 'projects', projectKey(dir))

  fs.mkdirSync(projectDir, { recursive: true })
  fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), '')
}

const forgetChat = (dir, sessionId) => {
  const projectDir = path.join(HOME, '.claude', 'projects', projectKey(dir))

  fs.unlinkSync(path.join(projectDir, `${sessionId}.jsonl`))
}

const manifest = (dir) => JSON.parse(fs.readFileSync(manifestFor(projectKey(dir)), 'utf8'))

const statuses = (dir) => {
  const labels = manifest(dir).files.map((entry) => `${entry[3]} ${path.basename(entry[0])}`)

  return labels.sort()
}

const nextSecond = () => new Promise((resolve) => setTimeout(resolve, 1100))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runTurn = async (dir, sessionId, workspaceFolders, mutate, { prompt = 'p', touch = [] } = {}) => {
  const project = projectKey(dir)

  registerChat(dir, sessionId)

  await turn.handle('begin', project, { session_id: sessionId, prompt }, workspaceFolders)
  await turn.handle('arm', project, { session_id: sessionId }, workspaceFolders)

  for (const file of touch) {
    const payload = { session_id: sessionId, tool_input: { file_path: file } }

    await turn.handle('arm', project, payload, workspaceFolders)
  }

  mutate()

  await turn.handle('end', project, { session_id: sessionId }, workspaceFolders)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export {
  HOME,
  check,
  run,
  createRepo,
  commitAll,
  write,
  registerChat,
  forgetChat,
  manifest,
  nextSecond,
  runTurn,
  statuses,
}
