import { startServer } from '../src/server.js'
import { getChatDir, getServerFile, getProjectKey } from '../src/util/paths.js'
import { HOME, check, createRepo } from './support.js'
import * as vscode from './vscode-stub.js'
import assert from 'assert'
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const HOOK = path.join(import.meta.dirname, '..', 'hooks', 'turn-diff.sh')

const settle = () => new Promise((resolve) => setTimeout(resolve, 60))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runHook = (mode, payload, cwd) => new Promise((resolve, reject) => {
  const options = { cwd, env: { ...process.env, HOME } }

  const child = execFile(HOOK, [mode], options, (error) => error ? reject(error) : resolve())

  child.stdin.end(JSON.stringify(payload))
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const advertOf = (dir) => {
  const advertFile = getServerFile(getProjectKey(dir), process.pid)

  return fs.existsSync(advertFile) ? fs.readFileSync(advertFile, 'utf8') : null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('re-advertising an unchanged workspace leaves the advert in place', async () => {
  const repo = createRepo()

  vscode.reset([repo])

  const server = startServer(() => {})

  await settle()

  const firstAdvert = advertOf(repo)

  assert.ok(firstAdvert, 'the window advertises once it is listening')

  server.readvertise()

  assert.strictEqual(advertOf(repo), firstAdvert, 'a no-op re-advertise must not disturb it')

  server.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a window with no folders advertises nothing', async () => {
  const repo = createRepo()

  vscode.reset([])

  const server = startServer(() => {})

  await settle()

  assert.strictEqual(advertOf(repo), null, 'nothing to serve, nothing advertised')

  vscode.state.folders = [repo]

  server.readvertise()

  assert.ok(advertOf(repo), 'it advertises once a folder arrives')

  vscode.state.folders = []

  server.readvertise()

  assert.strictEqual(advertOf(repo), null, 'and withdraws when the last one goes')

  server.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an advert deleted underneath the window is written again', async () => {
  const repo = createRepo()

  vscode.reset([repo])

  const server = startServer(() => {})

  await settle()

  const advertFile = getServerFile(getProjectKey(repo), process.pid)

  fs.unlinkSync(advertFile)
  server.readvertise()

  assert.ok(fs.existsSync(advertFile), 'the window notices its advert is gone')

  server.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('disposing removes the advert', async () => {
  const repo = createRepo()

  vscode.reset([repo])

  const server = startServer(() => {})

  await settle()

  assert.ok(advertOf(repo))

  server.dispose()

  assert.strictEqual(advertOf(repo), null)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('the hook keys state by the session, not by a cwd Claude has moved', async () => {
  const repo = createRepo()
  const project = getProjectKey(repo)

  vscode.reset([repo])

  const server = startServer(() => {})

  await settle()

  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'wandered-'))
  const transcriptFile = path.join(HOME, '.claude', 'projects', project, 'drifted.jsonl')

  await runHook('begin', { session_id: 'drifted', transcript_path: transcriptFile }, elsewhere)

  const belongsToSession = fs.existsSync(getChatDir(project, 'drifted'))
  const belongsToCwd = fs.existsSync(getChatDir(getProjectKey(elsewhere), 'drifted'))

  assert.ok(belongsToSession, 'the turn belongs to the project the session started in')
  assert.ok(!belongsToCwd, 'and never to the directory Claude happened to cd into')

  server.dispose()
})
