import { handleTurn } from '../src/turn/index.js'
import { getManifestFile, getProjectKey } from '../src/util/paths.js'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const HOME = process.env.HOME

if (!HOME.startsWith(os.tmpdir())) throw new Error('run the tests through npm test, HOME must be a temp directory')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const registeredChecks = []

export const check = (name, body) => registeredChecks.push({ name, body })

export const runChecks = async () => {
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

export const gitIn = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })

export const createRepo = () => {
  const repoDir = path.join(HOME, 'work', `repo${repoCounter++}`)

  fs.mkdirSync(repoDir, { recursive: true })

  gitIn(repoDir, 'init', '-q')
  gitIn(repoDir, 'config', 'user.email', 'test@example.com')
  gitIn(repoDir, 'config', 'user.name', 'test')

  return repoDir
}

export const commitAll = (dir) => {
  gitIn(dir, 'add', '-A')
  gitIn(dir, 'commit', '-qm', 'fixture')
}

export const write = (file, contents) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, contents)
}

export const registerChat = (dir, sessionId) => {
  const projectDir = path.join(HOME, '.claude', 'projects', getProjectKey(dir))

  fs.mkdirSync(projectDir, { recursive: true })
  fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), '')
}

export const forgetChat = (dir, sessionId) => {
  const projectDir = path.join(HOME, '.claude', 'projects', getProjectKey(dir))

  fs.unlinkSync(path.join(projectDir, `${sessionId}.jsonl`))
}

export const readManifest = (dir) => JSON.parse(fs.readFileSync(getManifestFile(getProjectKey(dir)), 'utf8'))

export const readStatuses = (dir) => {
  const labels = readManifest(dir).files.map((entry) => `${entry[3]} ${path.basename(entry[0])}`)

  return labels.sort()
}

export const nextSecond = () => new Promise((resolve) => setTimeout(resolve, 1100))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const runTurn = async (dir, sessionId, workspaceFolders, mutate, { prompt = 'p', touch = [] } = {}) => {
  const project = getProjectKey(dir)

  registerChat(dir, sessionId)

  await handleTurn('begin', project, { session_id: sessionId, prompt }, workspaceFolders)
  await handleTurn('arm', project, { session_id: sessionId }, workspaceFolders)

  for (const file of touch) {
    const payload = { session_id: sessionId, tool_input: { file_path: file } }

    await handleTurn('arm', project, payload, workspaceFolders)
  }

  mutate()

  await handleTurn('end', project, { session_id: sessionId }, workspaceFolders)
}
