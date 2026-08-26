import { readManifest } from '../../src/store/manifest.js'
import { getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { getRealPath, outputFile, readFile, removeFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { nextSecond, readChangedFileNames, registerChat, runTurn } from '../utils/turn.js'
import assert from 'node:assert'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join, relative as getRelativePath } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBeforeImageFile = (manifest, fileName) => {
  const { beforeFile } = manifest.changes.find((change) => change.beforeFile.endsWith(fileName))

  return join(manifest.beforeDir, beforeFile)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('records every changed file, keeping what each held before the turn', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'keep.txt'), 'one\n')
  outputFile(join(repoDir, 'gone.txt'), 'bye\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    outputFile(join(repoDir, 'keep.txt'), 'two\n')
    outputFile(join(repoDir, 'added.txt'), 'new\n')
    removeFile(join(repoDir, 'gone.txt'))
  })

  const manifest = readManifest(getProjectKey(repoDir))

  const preTurn = 'the before-image holds what the file held before the turn'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['added.txt', 'gone.txt', 'keep.txt'])
  assert.strictEqual(readFile(getBeforeImageFile(manifest, 'keep.txt'), 'utf8'), 'one\n', preTurn)
  assert.strictEqual(readFile(getBeforeImageFile(manifest, 'gone.txt'), 'utf8'), 'bye\n', 'it keeps its contents')
  assert.ok(!existsSync(getBeforeImageFile(manifest, 'added.txt')), 'a created file has no before-image')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file changed and changed back is not reported', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'a.txt'), 'same\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    outputFile(join(repoDir, 'a.txt'), 'changed\n')
    outputFile(join(repoDir, 'a.txt'), 'same\n')
    outputFile(join(repoDir, 'b.txt'), 'real\n')
  })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['b.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('creating an empty file is recorded, and writes no before-image', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'seed.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'added.txt'), ''))

  const manifest = readManifest(getProjectKey(repoDir))
  const reason = 'an absent before-image is what marks a creation, so an empty one would read as unchanged'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['added.txt'])
  assert.ok(!existsSync(getBeforeImageFile(manifest, 'added.txt')), reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('deleting an empty file is recorded, with an empty before-image', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'gone.txt'), '')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => removeFile(join(repoDir, 'gone.txt')))

  const manifest = readManifest(getProjectKey(repoDir))
  const reason = 'a zero-byte image still has to exist, or the deletion would read as a creation'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['gone.txt'])
  assert.strictEqual(readFile(getBeforeImageFile(manifest, 'gone.txt'), 'utf8'), '', reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('binary files are skipped', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))
  outputFile(join(repoDir, 'notes.txt'), 'x\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    outputFile(join(repoDir, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]))
    outputFile(join(repoDir, 'notes.txt'), 'y\n')
  })

  const reason = 'the png cannot render in a multi-diff editor, so it must not be listed'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['notes.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('untracked files over the size cap are excluded from both snapshots', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'seed.txt'), 'x\n')
  commitAll(repoDir)
  outputFile(join(repoDir, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 7))

  await runTurn(repoDir, 'chat', [repoDir], () => {
    outputFile(join(repoDir, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 8))
    outputFile(join(repoDir, 'seed.txt'), 'y\n')
  })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['seed.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a same-size edit is still seen when the snapshot lands a second later', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)
  registerChat(repoDir, 'chat')

  await handleTurn('begin', project, { session_id: 'chat', prompt: 'p' }, [repoDir])
  await handleTurn('arm', project, { session_id: 'chat' }, [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  await nextSecond()
  await handleTurn('end', project, { session_id: 'chat' }, [repoDir])

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a move is one change naming both paths, not an addition', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'old', 'moved.txt'), 'alpha\nbravo\ncharlie\ndelta\n')
  outputFile(join(repoDir, 'old', 'edited.txt'), 'one\ntwo\nthree\nfour\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    mkdirSync(join(repoDir, 'new'), { recursive: true })
    renameSync(join(repoDir, 'old', 'moved.txt'), join(repoDir, 'new', 'moved.txt'))
    renameSync(join(repoDir, 'old', 'edited.txt'), join(repoDir, 'new', 'edited.txt'))
    outputFile(join(repoDir, 'new', 'edited.txt'), 'one\ntwo CHANGED\nthree\nfour\n')
  })

  const manifest = readManifest(getProjectKey(repoDir))

  const moves = manifest.changes.map((change) => {
    const beforePath = getRelativePath(getRealPath(repoDir), change.beforeFile)
    const afterPath = getRelativePath(getRealPath(repoDir), change.afterFile)

    return `${beforePath} -> ${afterPath}`
  })

  const reason = 'git names only a rename destination, so a move used to arrive as an addition out of nowhere'

  const expectedMoves = ['old/edited.txt -> new/edited.txt', 'old/moved.txt -> new/moved.txt']

  assert.deepStrictEqual(moves.sort(), expectedMoves, reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a move keeps what the file held at its old path as the before-image', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'old', 'f.txt'), 'one\ntwo\nthree\nfour\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    mkdirSync(join(repoDir, 'new'), { recursive: true })
    renameSync(join(repoDir, 'old', 'f.txt'), join(repoDir, 'new', 'f.txt'))
    outputFile(join(repoDir, 'new', 'f.txt'), 'one\ntwo CHANGED\nthree\nfour\n')
  })

  const manifest = readManifest(getProjectKey(repoDir))
  const reason = 'a moved file diffs against its old contents, which is what makes the edit visible'

  const beforeImageFile = getBeforeImageFile(manifest, 'f.txt')

  assert.strictEqual(readFile(beforeImageFile, 'utf8'), 'one\ntwo\nthree\nfour\n', reason)
})
