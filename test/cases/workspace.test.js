import { readManifest } from '../../src/store/manifest.js'
import { getBeforeImagesDir, getManifestFile, getProjectKey } from '../../src/store/paths.js'
import { outputFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { HOME } from '../utils/home.js'
import { readChangedFileNames, runTurn } from '../utils/turn.js'
import { resetStub, stubState } from '../utils/vscode-stub.js'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
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
  assert.ok(watcher.disposed, 'the turn releases its watchers when it ends')
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

