import { readManifest } from '../../src/store/manifest.js'
import {
  getBeforeImagesDir, getManifestFile, getProjectKey, getServerFile, getSnapshotsFile,
} from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { outputFile, readFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import {
  interruptTurn, readChangedFileNames, recordApiError, recordAssistantReply, registerChat, runTurn, RUNNING_SUBAGENT,
  startTurn,
} from '../utils/turn.js'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readBeforeImage = (project, manifest) => {
  return readFile(join(getBeforeImagesDir(project), manifest.changes[0].beforeFile), 'utf8')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const seedRepo = () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  outputFile(join(repoDir, 'g.txt'), 'one\n')
  commitAll(repoDir)

  return repoDir
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a later turn replaces the before-images of the one it supersedes', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'first', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  assert.strictEqual(readBeforeImage(project, readManifest(project)), 'one\n')

  await runTurn(repoDir, 'second', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'three\n'))

  const reason = 'the images have to describe the turn the manifest describes'

  assert.strictEqual(readBeforeImage(project, readManifest(project)), 'two\n', reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a finishing turn leaves the server advert alone', async () => {
  const repoDir = createRepo()
  const advertFile = getServerFile(getProjectKey(repoDir))

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)
  outputFile(advertFile, '{"port":1,"token":"t","pid":1}')

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  assert.ok(existsSync(advertFile), 'the advert survived a turn that published a diff')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that changes nothing leaves the previous diff untouched', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)
  const manifestFile = getManifestFile(project)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  const publishedManifestContents = readFile(manifestFile, 'utf8')

  await runTurn(repoDir, 'chat', [repoDir], () => {})

  const reason = 'nothing was published, so nothing may have been cleared to make room for it'

  assert.strictEqual(readFile(manifestFile, 'utf8'), publishedManifestContents)
  assert.strictEqual(readBeforeImage(project, readManifest(project)), 'one\n', reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a prompt after you interrupted a turn starts a new one', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')
  interruptTurn(repoDir, 'chat')

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'three\n'))

  const reason = 'you stopped that turn yourself, so the next one diffs from where it left the files'

  assert.strictEqual(readBeforeImage(project, readManifest(project)), 'two\n', reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn left armed is not carried into another chat', async () => {
  const repoDir = seedRepo()

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  await runTurn(repoDir, 'other', [repoDir], () => outputFile(join(repoDir, 'g.txt'), 'two\n'))

  const reason = 'its baseline may be hours old by the time another chat starts, so that chat starts from its own'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['g.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn cut off by closing the window carries on when Claude Code resumes it', async () => {
  const repoDir = seedRepo()

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'g.txt'), 'two\n'))

  const reason = 'reopened, Claude Code resumes the turn with a prompt of its own, which carries a new prompt id'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt', 'g.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a prompt handed to a running turn leaves its baseline alone', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  outputFile(join(repoDir, 'g.txt'), 'one\n')
  commitAll(repoDir)

  const promptId = await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  await handleTurn('begin', project, { session_id: 'chat', prompt_id: promptId }, [repoDir])
  await handleTurn('arm', project, { session_id: 'chat', prompt_id: promptId }, [repoDir])

  outputFile(join(repoDir, 'g.txt'), 'two\n')

  await handleTurn('end', project, { session_id: 'chat', prompt_id: promptId }, [repoDir])

  const reason = 'a queued message or a finished background command reaches the running turn through UserPromptSubmit'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt', 'g.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a subagent dying on an API error does not end the turn it runs in', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  outputFile(join(repoDir, 'g.txt'), 'one\n')
  commitAll(repoDir)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  const subagentOutcome = await handleTurn('end', project, { session_id: 'chat', agent_id: 'subagent' }, [repoDir])
  const reason = 'Claude Code raises StopFailure for a failed subagent under the main session, with its agent_id'

  assert.deepStrictEqual(subagentOutcome, { published: false }, reason)
  assert.strictEqual(readManifest(project), undefined, 'so no diff opens for it')
  assert.ok(existsSync(getSnapshotsFile(project)), 'and the turn keeps the baseline it started from')

  outputFile(join(repoDir, 'g.txt'), 'two\n')

  await handleTurn('end', project, { session_id: 'chat' }, [repoDir])

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt', 'g.txt'], 'its own end still reports all of it')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that stops while its subagents still work carries on through the next prompt', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')
  recordAssistantReply(repoDir, 'chat', 'end_turn')

  const stopPayload = { session_id: 'chat', background_tasks: [RUNNING_SUBAGENT] }
  const outcome = await handleTurn('end', project, stopPayload, [repoDir])

  assert.deepStrictEqual(outcome, { published: false }, 'no diff opens while a subagent is still working')

  outputFile(join(repoDir, 'g.txt'), 'two\n')

  await startTurn(repoDir, 'chat', [repoDir])
  await handleTurn('end', project, { session_id: 'chat', background_tasks: [] }, [repoDir])

  const reason = 'the agent\'s report wakes the main agent as a new prompt, and a prompt of yours joins the same way'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt', 'g.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn whose main agent only launched agents still gets their edits', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)

  registerChat(repoDir, 'chat')

  await handleTurn('begin', project, { session_id: 'chat', prompt_id: 'launch' }, [repoDir])

  recordAssistantReply(repoDir, 'chat', 'end_turn')

  await handleTurn('end', project, { session_id: 'chat', background_tasks: [RUNNING_SUBAGENT] }, [repoDir])
  await handleTurn('arm', project, { session_id: 'chat', prompt_id: 'launch', agent_id: 'task-1' }, [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  await startTurn(repoDir, 'chat', [repoDir])
  await handleTurn('end', project, { session_id: 'chat' }, [repoDir])

  const reason = 'launching an agent arms nothing, so the agent\'s own first tool call takes the baseline'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a background shell or monitor does not hold the turn open', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  const devServer = { id: 'task-2', type: 'shell', status: 'running', description: 'dev', command: 'npm run dev' }
  const logMonitor = { id: 'task-3', type: 'monitor', status: 'running', description: 'watch the logs' }
  const stopPayload = { session_id: 'chat', background_tasks: [devServer, logMonitor] }

  const outcome = await handleTurn('end', project, stopPayload, [repoDir])
  const reason = 'a server started in the background may never finish, so waiting for it would hold every diff'

  assert.deepStrictEqual(outcome, { published: true }, reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn cut short by an API error shows its changes so far and carries on from the same baseline', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')
  recordApiError(repoDir, 'chat')

  const outcome = await handleTurn('end', project, { session_id: 'chat', hook_event_name: 'StopFailure' }, [repoDir])

  assert.deepStrictEqual(outcome, { published: true }, 'what the turn has done so far opens')
  assert.strictEqual(readManifest(project).running, true, 'as changes so far, which stays a preview')

  outputFile(join(repoDir, 'g.txt'), 'two\n')

  await startTurn(repoDir, 'chat', [repoDir])

  recordAssistantReply(repoDir, 'chat', 'end_turn')

  await handleTurn('end', project, { session_id: 'chat' }, [repoDir])

  const reason = 'continuing after the error is the same piece of work, so it lands in the same diff'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt', 'g.txt'], reason)
  assert.strictEqual(readManifest(project).running, false, 'which is finished now')
})
