import * as server from '../src/server.js'
import { chatDirFor, serverFileFor, projectKey } from '../src/util/paths.js'
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
  const advertFile = serverFileFor(projectKey(dir), process.pid)

  return fs.existsSync(advertFile) ? fs.readFileSync(advertFile, 'utf8') : null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('re-advertising an unchanged workspace leaves the advert in place', async () => {
  const repo = createRepo()

  vscode.reset([repo])

  const hookServer = server.start(() => {})

  await settle()

  const firstAdvert = advertOf(repo)

  assert.ok(firstAdvert, 'the window advertises once it is listening')

  hookServer.readvertise()

  assert.strictEqual(advertOf(repo), firstAdvert, 'a no-op re-advertise must not disturb it')

  hookServer.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a window with no folders advertises nothing', async () => {
  const repo = createRepo()

  vscode.reset([])

  const hookServer = server.start(() => {})

  await settle()

  assert.strictEqual(advertOf(repo), null, 'nothing to serve, nothing advertised')

  vscode.state.folders = [repo]

  hookServer.readvertise()

  assert.ok(advertOf(repo), 'it advertises once a folder arrives')

  vscode.state.folders = []

  hookServer.readvertise()

  assert.strictEqual(advertOf(repo), null, 'and withdraws when the last one goes')

  hookServer.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an advert deleted underneath the window is written again', async () => {
  const repo = createRepo()

  vscode.reset([repo])

  const hookServer = server.start(() => {})

  await settle()

  const advertFile = serverFileFor(projectKey(repo), process.pid)

  fs.unlinkSync(advertFile)
  hookServer.readvertise()

  assert.ok(fs.existsSync(advertFile), 'the window notices its advert is gone')

  hookServer.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('disposing removes the advert', async () => {
  const repo = createRepo()

  vscode.reset([repo])

  const hookServer = server.start(() => {})

  await settle()

  assert.ok(advertOf(repo))

  hookServer.dispose()

  assert.strictEqual(advertOf(repo), null)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('the hook keys state by the session, not by a cwd Claude has moved', async () => {
  const repo = createRepo()
  const project = projectKey(repo)

  vscode.reset([repo])

  const hookServer = server.start(() => {})

  await settle()

  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'wandered-'))
  const transcriptFile = path.join(HOME, '.claude', 'projects', project, 'drifted.jsonl')

  await runHook('begin', { session_id: 'drifted', transcript_path: transcriptFile }, elsewhere)

  const belongsToSession = fs.existsSync(chatDirFor(project, 'drifted'))
  const belongsToCwd = fs.existsSync(chatDirFor(projectKey(elsewhere), 'drifted'))

  assert.ok(belongsToSession, 'the turn belongs to the project the session started in')
  assert.ok(!belongsToCwd, 'and never to the directory Claude happened to cd into')

  hookServer.dispose()
})
