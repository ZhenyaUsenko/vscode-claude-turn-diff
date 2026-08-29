import { startServer } from '../../src/server.js'
import { getServerFile, getProjectKey, getSessionIdFile } from '../../src/store/paths.js'
import { readFile, removeFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { createRepo } from '../utils/fixtures.js'
import { HOME } from '../utils/home.js'
import { resetStub, stubState } from '../utils/vscode-stub.js'
import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const HOOK_SCRIPT = join(import.meta.dirname, '..', '..', 'hooks', 'turn-diff.sh')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const settle = () => {
  return new Promise((resolve) => setTimeout(resolve, 60))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runHook = (mode, payload, cwd) => {
  return new Promise((resolve, reject) => {
    const options = { cwd, env: { ...process.env, HOME } }

    const child = execFile(HOOK_SCRIPT, [mode], options, (error) => error ? reject(error) : resolve())

    child.stdin.end(JSON.stringify(payload))
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getAdvert = (dir) => {
  const advertFile = getServerFile(getProjectKey(dir), process.pid)

  return readFile(advertFile, 'utf8')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('re-advertising an unchanged workspace leaves the advert in place', async () => {
  const repoDir = createRepo()

  resetStub([repoDir])

  const server = startServer()

  await settle()

  const firstAdvert = getAdvert(repoDir)

  assert.ok(firstAdvert, 'the window advertises once it is listening')

  server.readvertise()

  assert.strictEqual(getAdvert(repoDir), firstAdvert, 'a no-op re-advertise must not disturb it')

  server.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a window with no folders serves the home project', async () => {
  const repoDir = createRepo()

  resetStub([])

  const server = startServer()

  await settle()

  const homeReason = 'Claude Code keys a chat started with no folder open under the home directory'

  assert.ok(getAdvert(HOME), homeReason)
  assert.strictEqual(getAdvert(repoDir), undefined, 'and not under a project it cannot see')

  stubState.workspaceDirs = [repoDir]

  server.readvertise()

  assert.ok(getAdvert(repoDir), 'it moves to the folder once one arrives')
  assert.strictEqual(getAdvert(HOME), undefined, 'leaving only one advert per window')

  server.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an advert deleted underneath the window is written again', async () => {
  const repoDir = createRepo()

  resetStub([repoDir])

  const server = startServer()

  await settle()

  const advertFile = getServerFile(getProjectKey(repoDir), process.pid)

  removeFile(advertFile)
  server.readvertise()

  assert.ok(existsSync(advertFile), 'the window notices its advert is gone')

  server.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('disposing removes the advert', async () => {
  const repoDir = createRepo()

  resetStub([repoDir])

  const server = startServer()

  await settle()

  assert.ok(getAdvert(repoDir))

  server.dispose()

  assert.strictEqual(getAdvert(repoDir), undefined)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('the hook keys state by the session, not by a cwd Claude has moved', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)

  resetStub([repoDir])

  const server = startServer()

  await settle()

  const elsewhereDir = mkdtempSync(join(tmpdir(), 'wandered-'))
  const transcriptFile = join(HOME, '.claude', 'projects', project, 'drifted.jsonl')

  await runHook('arm', { session_id: 'drifted', transcript_path: transcriptFile }, elsewhereDir)

  const belongsToSession = existsSync(getSessionIdFile(project))
  const belongsToCwd = existsSync(getSessionIdFile(getProjectKey(elsewhereDir)))

  assert.ok(belongsToSession, 'the turn belongs to the project the session started in')
  assert.ok(!belongsToCwd, 'and never to the directory Claude happened to cd into')

  server.dispose()
})
