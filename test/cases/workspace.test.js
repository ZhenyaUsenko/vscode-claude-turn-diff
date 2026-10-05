import { readManifest } from '../../src/store/manifest.js'
import { getBeforeImagesDir, getManifestFile, getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { outputFile, readFile } from '../../src/utils/files.js'
import { NUDGE_DELAY, RELEASE_DELAY } from '../../src/utils/watch.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { HOME } from '../utils/home.js'
import { readChangedFileNames, runTurn, startTurn, wait } from '../utils/turn.js'
import { resetStub, stubState } from '../utils/vscode-stub.js'
import assert from 'node:assert'
import { existsSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const seedRepo = () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  return repoDir
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn spanning two repositories produces one manifest', async () => {
  const repoDirA = seedRepo()
  const repoDirB = seedRepo()

  await runTurn(repoDirA, 'chat', [repoDirA, repoDirB], () => {
    outputFile(join(repoDirA, 'f.txt'), 'two\n')
    outputFile(join(repoDirB, 'f.txt'), 'three\n')
  })

  assert.strictEqual(readManifest(getProjectKey(repoDirA)).changes.length, 2, 'both repositories in one manifest')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file outside every repository is captured', async () => {
  const repoDir = seedRepo()
  const outsideFile = join(HOME, 'outside', 'notes.md')

  outputFile(outsideFile, 'before\n')

  const mutate = () => {
    outputFile(outsideFile, 'after\n')
    outputFile(join(repoDir, 'f.txt'), 'two\n')
  }

  await runTurn(repoDir, 'chat', [repoDir], mutate, { touchedFiles: [outsideFile] })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt', 'notes.md'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file created outside every repository is captured with no before-image', async () => {
  const repoDir = seedRepo()
  const outsideFile = join(HOME, 'created', 'notes.md')

  const mutate = () => {
    outputFile(outsideFile, 'new\n')
    outputFile(join(repoDir, 'f.txt'), 'two\n')
  }

  await runTurn(repoDir, 'chat', [repoDir], mutate, { touchedFiles: [outsideFile] })

  const manifest = readManifest(getProjectKey(repoDir))
  const createdChange = manifest.changes.find((change) => change.beforeFile === outsideFile)
  const reason = 'the file did not exist when the turn armed, so nothing was copied for it'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt', 'notes.md'])
  assert.ok(!existsSync(join(getBeforeImagesDir(getProjectKey(repoDir)), createdChange.beforeFile)), reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file outside every repository that a tool names but never creates publishes nothing', async () => {
  const repoDir = seedRepo()
  const manifestFile = getManifestFile(getProjectKey(repoDir))
  const neverCreatedFile = join(HOME, 'never-created', 'notes.md')

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  const publishedManifestContents = readFile(manifestFile, 'utf8')

  await runTurn(repoDir, 'chat', [repoDir], () => {}, { touchedFiles: [neverCreatedFile] })

  const reason = 'a write that was refused or failed leaves neither side to show, so the last diff must stay'

  assert.strictEqual(readFile(manifestFile, 'utf8'), publishedManifestContents, reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a binary file outside every repository is skipped, not counted', async () => {
  const repoDir = seedRepo()
  const outsideFile = join(HOME, 'outside', 'pic.png')

  outputFile(outsideFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))

  const mutate = () => {
    outputFile(outsideFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]))
    outputFile(join(repoDir, 'f.txt'), 'two\n')
  }

  await runTurn(repoDir, 'chat', [repoDir], mutate, { touchedFiles: [outsideFile] })

  const reason = 'a listed binary is counted in the title and then fails to render, so the count would lie'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('arming a file outside the workspace watches it, once', async () => {
  const repoDir = seedRepo()
  const outsideFile = join(HOME, 'watched', 'notes.md')

  outputFile(outsideFile, 'before\n')
  resetStub([repoDir])

  const mutate = () => {
    outputFile(join(repoDir, 'f.txt'), 'two\n')
    outputFile(outsideFile, 'after\n')
  }

  const touchedFiles = [outsideFile, outsideFile, join(repoDir, 'f.txt')]

  await runTurn(repoDir, 'chat', [repoDir], mutate, { touchedFiles })

  const [watcher] = stubState.watchers

  assert.strictEqual(stubState.watchers.length, 1, 'the in-workspace file needs no watcher')
  assert.strictEqual(watcher.pattern.base.fsPath, dirname(outsideFile))
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file outside the workspace is nudged a moment after it is first armed', async () => {
  const repoDir = seedRepo()
  const outsideFile = join(HOME, 'nudged', 'notes.md')

  outputFile(outsideFile, 'before\n')
  resetStub([repoDir])

  const { ctimeMs, mtimeMs } = statSync(outsideFile)

  await startTurn(repoDir, 'chat', [repoDir], { touchedFiles: [outsideFile] })
  await wait(NUDGE_DELAY + 100)

  const nudgedStats = statSync(outsideFile)
  const reason = 'a write landing before its watcher is live goes unreported, so the file is touched again once it is'

  assert.ok(nudgedStats.ctimeMs > ctimeMs, reason)
  assert.ok(Math.abs(nudgedStats.mtimeMs - mtimeMs) < 0.01, 'without moving its modification time')

  await handleTurn('end', getProjectKey(repoDir), { session_id: 'chat' }, [repoDir])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn releases its watchers a moment after it ends, and only its own', async () => {
  const repoDir = seedRepo()
  const outsideFile = join(HOME, 'released', 'notes.md')

  outputFile(outsideFile, 'before\n')
  resetStub([repoDir])

  await runTurn(repoDir, 'chat', [repoDir], () => {}, { touchedFiles: [outsideFile] })

  const [finishedTurnWatcher] = stubState.watchers

  assert.ok(!finishedTurnWatcher.disposed, 'a nudge from the last edit may still be on its way when the turn ends')

  await startTurn(repoDir, 'chat', [repoDir], { touchedFiles: [outsideFile] })
  await wait(RELEASE_DELAY + 100)

  const [, runningTurnWatcher] = stubState.watchers

  assert.ok(finishedTurnWatcher.disposed, 'it is released a moment later')
  assert.ok(!runningTurnWatcher.disposed, 'and the next turn keeps the watcher it made for the same file')

  await handleTurn('end', getProjectKey(repoDir), { session_id: 'chat' }, [repoDir])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('two projects do not overwrite each other', async () => {
  const repoDirA = seedRepo()
  const repoDirB = seedRepo()

  await runTurn(repoDirA, 'chat-a', [repoDirA], () => outputFile(join(repoDirA, 'f.txt'), 'A\n'))
  await runTurn(repoDirB, 'chat-b', [repoDirB], () => outputFile(join(repoDirB, 'f.txt'), 'B\n'))

  const manifestFileA = getManifestFile(getProjectKey(repoDirA))
  const manifestFileB = getManifestFile(getProjectKey(repoDirB))

  const reason = 'project A\'s before-image survived project B\'s turn'

  const imagesA = getBeforeImagesDir(getProjectKey(repoDirA))
  const imagesB = getBeforeImagesDir(getProjectKey(repoDirB))

  const manifestA = readManifest(getProjectKey(repoDirA))
  const manifestB = readManifest(getProjectKey(repoDirB))

  assert.notStrictEqual(manifestFileA, manifestFileB)
  assert.ok(existsSync(join(imagesA, manifestA.changes[0].beforeFile)), reason)
  assert.ok(existsSync(join(imagesB, manifestB.changes[0].beforeFile)))
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('files outside every repository come last, in their own order', async () => {
  const repoDir = seedRepo()
  const laterFile = join(HOME, 'zzz-outside', 'later.md')
  const earlierFile = join(HOME, 'aaa-outside', 'earlier.md')

  outputFile(laterFile, 'before\n')
  outputFile(earlierFile, 'before\n')

  const mutate = () => {
    outputFile(join(repoDir, 'f.txt'), 'two\n')
    outputFile(laterFile, 'after\n')
    outputFile(earlierFile, 'after\n')
  }

  await runTurn(repoDir, 'chat', [repoDir], mutate, { touchedFiles: [laterFile, earlierFile] })

  const names = readManifest(getProjectKey(repoDir)).changes.map((change) => basename(change.afterFile))
  const reason = 'they were touched the other way round, and they belong after everything in the repository'

  assert.deepStrictEqual(names, ['f.txt', 'earlier.md', 'later.md'], reason)
})

