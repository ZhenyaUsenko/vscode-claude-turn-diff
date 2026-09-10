import { startServer } from '../../src/server.js'
import { showLastTurn } from '../../src/view.js'
import { getServerFile, getProjectKey, getSessionIdFile } from '../../src/store/paths.js'
import { outputFile, readFile, removeFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { HOME } from '../utils/home.js'
import { resetStub, stubState } from '../utils/vscode-stub.js'
import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

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
  return readFile(getServerFile(getProjectKey(dir)), 'utf8')
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

  const advertFile = getServerFile(getProjectKey(repoDir))

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

  await runHook('arm', { session_id: 'drifted', prompt_id: 'drifted', transcript_path: transcriptFile }, elsewhereDir)

  const belongsToSession = existsSync(getSessionIdFile(project))
  const belongsToCwd = existsSync(getSessionIdFile(getProjectKey(elsewhereDir)))

  assert.ok(belongsToSession, 'the turn belongs to the project the session started in')
  assert.ok(!belongsToCwd, 'and never to the directory Claude happened to cd into')

  server.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn ending through the hook reports back, which is what opens the diff', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)
  const transcriptFile = join(HOME, '.claude', 'projects', project, 'hooked.jsonl')

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)
  outputFile(transcriptFile, '')
  resetStub([repoDir])

  const server = startServer(null, showLastTurn)

  await settle()

  const payload = { session_id: 'hooked', prompt_id: 'hooked', transcript_path: transcriptFile }

  await runHook('begin', payload, repoDir)
  await runHook('arm', payload, repoDir)

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  await runHook('end', payload, repoDir)
  await settle()

  const rendered = stubState.executed.map((call) => call.resources.map(([uri]) => basename(uri.fsPath)))
  const reason = 'nothing watches the manifest, so a published turn has to announce itself'

  assert.deepStrictEqual(rendered, [['f.txt']], reason)

  server.dispose()
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a window takes the advert back on focus, and leaves someone else\'s alone on the way out', async () => {
  const repoDir = createRepo()
  const advertFile = getServerFile(getProjectKey(repoDir))
  const otherWindow = '{"port":1,"token":"other","pid":1}'

  resetStub([repoDir])

  const server = startServer()

  await settle()

  const ours = getAdvert(repoDir)

  outputFile(advertFile, otherWindow)
  server.readvertise()

  assert.strictEqual(getAdvert(repoDir), ours, 'focusing this window makes it the one being served')

  outputFile(advertFile, otherWindow)
  server.dispose()

  const reason = 'the advert belongs to another window now, so closing this one must not take it away'

  assert.strictEqual(getAdvert(repoDir), otherWindow, reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('moving to another project takes the advert with it', async () => {
  const repoDirA = createRepo()
  const repoDirB = createRepo()

  resetStub([repoDirA])

  const server = startServer()

  await settle()

  const ours = getAdvert(repoDirA)

  assert.ok(ours, 'it advertises where it started')

  stubState.workspaceDirs = [repoDirB]
  server.readvertise()

  assert.strictEqual(getAdvert(repoDirA), undefined, 'the project it left is no longer served by it')
  assert.strictEqual(getAdvert(repoDirB), ours, 'and the one it moved to is')

  stubState.workspaceDirs = [repoDirA, repoDirB]
  server.readvertise()

  const reason = 'the first folder still keys the same project, so there is nothing to move'

  assert.strictEqual(getAdvert(repoDirA), ours, reason)
  assert.strictEqual(getAdvert(repoDirB), undefined)

  server.dispose()
})
