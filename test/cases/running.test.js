import { readManifest } from '../../src/store/manifest.js'
import { handleTurn } from '../../src/turn/index.js'
import { getProjectKey, getSnapshotsFile } from '../../src/store/paths.js'
import { outputFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { getRenderedFileNames, render } from '../utils/render.js'
import { interruptTurn, recordAssistantReply, runTurn, startTurn } from '../utils/turn.js'
import { resetStub, stubState } from '../utils/vscode-stub.js'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { HOME } from '../utils/home.js'
import { basename, join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const seedRepo = () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  outputFile(join(repoDir, 'g.txt'), 'one\n')
  commitAll(repoDir)

  return repoDir
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn still running shows what it has changed so far', async () => {
  const repoDir = seedRepo()

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  const diffData = await render([repoDir])
  const reason = 'the turn has not ended, so there is no manifest to read this from'

  assert.strictEqual(diffData.title, 'Changes so far')
  assert.deepStrictEqual(getRenderedFileNames(diffData), ['f.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a running turn is brought up to date each time it is asked for', async () => {
  const repoDir = seedRepo()

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  assert.deepStrictEqual(getRenderedFileNames(await render([repoDir])), ['f.txt'])

  outputFile(join(repoDir, 'g.txt'), 'two\n')

  const reason = 'the turn is still going, so whatever it has done since has to be picked up'

  assert.deepStrictEqual(getRenderedFileNames(await render([repoDir])), ['f.txt', 'g.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn you interrupted is finished off and published', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')
  interruptTurn(repoDir, 'chat')

  const diffData = await render([repoDir])
  const reason = 'Claude Code runs no Stop hook on an interrupted turn, so this is the only chance to keep it'

  assert.strictEqual(diffData.title, 'Last turn changes')
  assert.deepStrictEqual(getRenderedFileNames(diffData), ['f.txt'])
  assert.deepStrictEqual(readManifest(project).changes.length, 1, reason)
  assert.ok(!existsSync(getSnapshotsFile(project)), 'the turn is over, so it is no longer armed')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('the diff of an interrupted turn stops growing', async () => {
  const repoDir = seedRepo()

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')
  interruptTurn(repoDir, 'chat')

  assert.deepStrictEqual(getRenderedFileNames(await render([repoDir])), ['f.txt'])

  outputFile(join(repoDir, 'g.txt'), 'two\n')

  const reason = 'the turn is over, so what you go on to edit yourself is not part of it'

  assert.deepStrictEqual(getRenderedFileNames(await render([repoDir])), ['f.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that ended is never collected again', async () => {
  const repoDir = seedRepo()

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  outputFile(join(repoDir, 'g.txt'), 'two\n')

  const diffData = await render([repoDir])
  const reason = 'the published turn is a record of what it did, not of what has happened since'

  assert.strictEqual(diffData.title, 'Last turn changes')
  assert.deepStrictEqual(getRenderedFileNames(diffData), ['f.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a running turn that has changed nothing falls back to the last finished turn', async () => {
  const repoDir = seedRepo()

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))
  await startTurn(repoDir, 'chat', [repoDir])

  const diffData = await render([repoDir])
  const reason = 'arm fires on Bash, so a turn is armed long before it has changed anything'

  assert.strictEqual(diffData.title, 'Last turn changes')
  assert.deepStrictEqual(getRenderedFileNames(diffData), ['f.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn whose Stop hook never arrived is published when it is asked for', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')
  recordAssistantReply(repoDir, 'chat', 'end_turn')

  const diffData = await render([repoDir])
  const reason = 'the turn ended but nothing told us, as when the window was closed as it finished'

  assert.strictEqual(diffData.title, 'Last turn changes')
  assert.deepStrictEqual(getRenderedFileNames(diffData), ['f.txt'])
  assert.strictEqual(readManifest(project).changes.length, 1, reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that paused rather than ended is still running', async () => {
  const pausedReason = 'stopping to call a tool is how a turn continues, not how it ends'
  const unknownReason = 'only a reason known to end a turn may end one, or a new one would read as the end'

  for (const [stopReason, reason] of [['tool_use', pausedReason], ['pause_turn', unknownReason]]) {
    const repoDir = seedRepo()

    await startTurn(repoDir, 'chat', [repoDir])

    outputFile(join(repoDir, 'f.txt'), 'two\n')
    recordAssistantReply(repoDir, 'chat', stopReason)

    const diffData = await render([repoDir])

    assert.strictEqual(diffData.title, 'Changes so far', reason)
    assert.deepStrictEqual(getRenderedFileNames(diffData), ['f.txt'])
  }
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('looking at a running turn leaves it armed, so the rest of it is still captured', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  await render([repoDir])

  outputFile(join(repoDir, 'g.txt'), 'two\n')

  await handleTurn('end', project, { session_id: 'chat' }, [repoDir])

  const manifest = readManifest(project)
  const reason = 'looking must not consume the baseline the rest of the turn diffs against'

  assert.deepStrictEqual(manifest.changes.map((change) => basename(change.afterFile)), ['f.txt', 'g.txt'], reason)
  assert.strictEqual(manifest.running, false, 'the turn has ended by now')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('looking at a running turn keeps watching the files outside the workspace', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)
  const outsideFile = join(HOME, 'looked-at', 'notes.md')

  outputFile(outsideFile, 'before\n')
  resetStub([repoDir])

  await startTurn(repoDir, 'chat', [repoDir], { touchedFiles: [outsideFile] })

  const [watcher] = stubState.watchers

  outputFile(outsideFile, 'after\n')

  await render([repoDir])

  assert.ok(!watcher.disposed, 'the turn is still going, and its later edits still need reporting')

  await handleTurn('end', project, { session_id: 'chat' }, [repoDir])

  assert.ok(watcher.disposed, 'the turn is over now')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a look and the end of the same turn are told apart within one second', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  await render([repoDir])

  const lookedAt = readManifest(project).ts

  await handleTurn('end', project, { session_id: 'chat' }, [repoDir])

  const reason = 'a repeated stamp reads as already rendered, so the finished diff would never open'

  assert.notStrictEqual(readManifest(project).ts, lookedAt, reason)
})
