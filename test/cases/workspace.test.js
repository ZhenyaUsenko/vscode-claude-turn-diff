import { readManifest } from '../../src/store/manifest.js'
import { getManifestFile, getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { outputFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { HOME } from '../utils/home.js'
import { readStatuses, registerChat, runTurn } from '../utils/turn.js'
import { resetStub, stubState } from '../utils/vscode-stub.js'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const seedRepo = () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  return repoDir
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getWatcher = (targetFile) => {
  const dir = dirname(targetFile)

  return stubState.watchers.find((watcher) => watcher.pattern.base.fsPath === dir)
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

  assert.deepStrictEqual(readStatuses(repoDir), ['M f.txt', 'M notes.md'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file created outside every repository is reported as an addition', async () => {
  const repoDir = seedRepo()
  const outsideFile = join(HOME, 'created', 'notes.md')

  const mutate = () => {
    outputFile(outsideFile, 'new\n')
    outputFile(join(repoDir, 'f.txt'), 'two\n')
  }

  await runTurn(repoDir, 'chat', [repoDir], mutate, { touchedFiles: [outsideFile] })

  const reason = 'the file did not exist when the turn armed, so it has no before-image'

  assert.deepStrictEqual(readStatuses(repoDir), ['A notes.md', 'M f.txt'], reason)
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

  assert.deepStrictEqual(readStatuses(repoDir), ['M f.txt'], reason)
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

check('a chat ending leaves a parallel chat mid-turn still watching', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)
  const fileForA = join(HOME, 'chat-a', 'notes.md')
  const fileForB = join(HOME, 'chat-b', 'notes.md')

  outputFile(fileForA, 'before\n')
  outputFile(fileForB, 'before\n')
  resetStub([repoDir])
  registerChat(repoDir, 'b')

  await handleTurn('begin', project, { session_id: 'b', prompt: 'p' }, [repoDir])
  await handleTurn('arm', project, { session_id: 'b', tool_input: { file_path: fileForB } }, [repoDir])
  await runTurn(repoDir, 'a', [repoDir], () => outputFile(fileForA, 'after\n'), { touchedFiles: [fileForA] })

  assert.ok(getWatcher(fileForA).disposed, 'the chat that finished released its own')
  assert.ok(!getWatcher(fileForB).disposed, 'the chat still mid-turn keeps watching')
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

  assert.notStrictEqual(manifestFileA, manifestFileB)
  assert.ok(existsSync(readManifest(getProjectKey(repoDirA)).changes[0].beforeImageFile), reason)
  assert.ok(existsSync(readManifest(getProjectKey(repoDirB)).changes[0].beforeImageFile))
})
