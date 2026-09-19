import { readManifest } from '../../src/store/manifest.js'
import {
  getBeforeImagesDir, getManifestFile, getProjectKey, getServerFile, getSnapshotsFile,
} from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { outputFile, readFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { interruptTurn, readChangedFileNames, runTurn, startTurn } from '../utils/turn.js'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readBeforeImage = (project, manifest) => {
  return readFile(join(getBeforeImagesDir(project), manifest.changes[0].beforeFile), 'utf8')
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

check('a new turn discards what an abandoned one left armed', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await startTurn(repoDir, 'abandoned', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')
  interruptTurn(repoDir, 'abandoned')

  await runTurn(repoDir, 'alive', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'three\n'))

  const reason = 'its baseline is stale now that another turn has run on top of it'

  assert.strictEqual(readBeforeImage(project, readManifest(project)), 'two\n', reason)
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

  const reason = 'a queued message or a finished background command fires UserPromptSubmit with the running turn\'s id'

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
