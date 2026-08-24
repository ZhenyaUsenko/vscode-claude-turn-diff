import { readManifest } from '../../src/store/manifest.js'
import { getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { getRealPath, outputFile, readFile, removeFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { nextSecond, readStatuses, registerChat, runTurn } from '../utils/turn.js'
import assert from 'node:assert'
import { mkdirSync, renameSync } from 'node:fs'
import { join, relative as getRelativePath } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('reports A, M and D with correct before-images', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'keep.txt'), 'one\n')
  outputFile(join(repoDir, 'gone.txt'), 'bye\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    outputFile(join(repoDir, 'keep.txt'), 'two\n')
    outputFile(join(repoDir, 'added.txt'), 'new\n')
    removeFile(join(repoDir, 'gone.txt'))
  })

  const { changes } = readManifest(getProjectKey(repoDir))

  const modifiedChange = changes.find((change) => change.beforeFile.endsWith('keep.txt'))
  const beforeImageContents = readFile(modifiedChange.beforeImageFile, 'utf8')

  assert.deepStrictEqual(readStatuses(repoDir), ['A added.txt', 'D gone.txt', 'M keep.txt'])
  assert.strictEqual(beforeImageContents, 'one\n', 'the before-image holds the pre-turn content')
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

  assert.deepStrictEqual(readStatuses(repoDir), ['A b.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('creating an empty file is reported as an addition', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'seed.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'added.txt'), ''))

  const reason = 'an empty file matches an absent before-image byte for byte, but creating it is still a change'

  assert.deepStrictEqual(readStatuses(repoDir), ['A added.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('deleting an empty file is reported as a deletion', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'gone.txt'), '')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => removeFile(join(repoDir, 'gone.txt')))

  assert.deepStrictEqual(readStatuses(repoDir), ['D gone.txt'])
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

  assert.deepStrictEqual(readStatuses(repoDir), ['M notes.txt'], reason)
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

  assert.deepStrictEqual(readStatuses(repoDir), ['M seed.txt'])
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

  assert.deepStrictEqual(readStatuses(repoDir), ['M f.txt'])
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

  const { changes } = readManifest(getProjectKey(repoDir))

  const moves = changes.map((change) => {
    const beforePath = getRelativePath(getRealPath(repoDir), change.beforeFile)
    const afterPath = getRelativePath(getRealPath(repoDir), change.afterFile)

    return `${change.status} ${beforePath} -> ${afterPath}`
  })

  const reason = 'git names only a rename destination, so a move used to arrive as an addition out of nowhere'

  const expectedMoves = ['M old/edited.txt -> new/edited.txt', 'M old/moved.txt -> new/moved.txt']

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

  const { beforeImageFile } = readManifest(getProjectKey(repoDir)).changes[0]
  const reason = 'a moved file diffs against its old contents, which is what makes the edit visible'

  assert.strictEqual(readFile(beforeImageFile, 'utf8'), 'one\ntwo\nthree\nfour\n', reason)
})
