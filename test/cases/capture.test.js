import { readManifest } from '../../src/store/manifest.js'
import { getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { getRealPath, outputFile, readFile, removeFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { nextSecond, readStatuses, registerChat, runTurn } from '../utils/turn.js'
import assert from 'assert'
import { mkdirSync, renameSync } from 'fs'
import { join, relative as getRelativePath } from 'path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('reports A, M and D with correct before-images', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'keep.txt'), 'one\n')
  outputFile(join(repo, 'gone.txt'), 'bye\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    outputFile(join(repo, 'keep.txt'), 'two\n')
    outputFile(join(repo, 'added.txt'), 'new\n')
    removeFile(join(repo, 'gone.txt'))
  })

  const modifiedEntry = readManifest(getProjectKey(repo)).files.find((entry) => entry.beforePath.endsWith('keep.txt'))
  const beforeContents = readFile(modifiedEntry.beforeImage, 'utf8')

  assert.deepStrictEqual(readStatuses(repo), ['A added.txt', 'D gone.txt', 'M keep.txt'])
  assert.strictEqual(beforeContents, 'one\n', 'the before-image holds the pre-turn content')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file changed and changed back is not reported', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'a.txt'), 'same\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    outputFile(join(repo, 'a.txt'), 'changed\n')
    outputFile(join(repo, 'a.txt'), 'same\n')
    outputFile(join(repo, 'b.txt'), 'real\n')
  })

  assert.deepStrictEqual(readStatuses(repo), ['A b.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('binary files are skipped', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))
  outputFile(join(repo, 'notes.txt'), 'x\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    outputFile(join(repo, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]))
    outputFile(join(repo, 'notes.txt'), 'y\n')
  })

  const reason = 'the png cannot render in a multi-diff editor, so it must not be listed'

  assert.deepStrictEqual(readStatuses(repo), ['M notes.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('untracked files over the size cap are excluded from both snapshots', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'seed.txt'), 'x\n')
  commitAll(repo)
  outputFile(join(repo, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 7))

  await runTurn(repo, 'chat', [repo], () => {
    outputFile(join(repo, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 8))
    outputFile(join(repo, 'seed.txt'), 'y\n')
  })

  assert.deepStrictEqual(readStatuses(repo), ['M seed.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a same-size edit is still seen when the snapshot lands a second later', async () => {
  const repo = createRepo()
  const project = getProjectKey(repo)

  outputFile(join(repo, 'f.txt'), 'one\n')
  commitAll(repo)
  registerChat(repo, 'chat')

  await handleTurn('begin', project, { session_id: 'chat', prompt: 'p' }, [repo])
  await handleTurn('arm', project, { session_id: 'chat' }, [repo])

  outputFile(join(repo, 'f.txt'), 'two\n')

  await nextSecond()
  await handleTurn('end', project, { session_id: 'chat' }, [repo])

  assert.deepStrictEqual(readStatuses(repo), ['M f.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a move is one entry naming both paths, not an addition', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'old', 'moved.txt'), 'alpha\nbravo\ncharlie\ndelta\n')
  outputFile(join(repo, 'old', 'edited.txt'), 'one\ntwo\nthree\nfour\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    mkdirSync(join(repo, 'new'), { recursive: true })
    renameSync(join(repo, 'old', 'moved.txt'), join(repo, 'new', 'moved.txt'))
    renameSync(join(repo, 'old', 'edited.txt'), join(repo, 'new', 'edited.txt'))
    outputFile(join(repo, 'new', 'edited.txt'), 'one\ntwo CHANGED\nthree\nfour\n')
  })

  const root = getRealPath(repo)

  const moves = readManifest(getProjectKey(repo)).files.map((entry) => {
    return `${entry.status} ${getRelativePath(root, entry.beforePath)} -> ${getRelativePath(root, entry.afterPath)}`
  })

  const reason = 'git names only a rename destination, so a move used to arrive as an addition out of nowhere'

  const expectedMoves = ['M old/edited.txt -> new/edited.txt', 'M old/moved.txt -> new/moved.txt']

  assert.deepStrictEqual(moves.sort(), expectedMoves, reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a move keeps what the file held at its old path as the before-image', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'old', 'f.txt'), 'one\ntwo\nthree\nfour\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    mkdirSync(join(repo, 'new'), { recursive: true })
    renameSync(join(repo, 'old', 'f.txt'), join(repo, 'new', 'f.txt'))
    outputFile(join(repo, 'new', 'f.txt'), 'one\ntwo CHANGED\nthree\nfour\n')
  })

  const { beforeImage } = readManifest(getProjectKey(repo)).files[0]
  const reason = 'a moved file diffs against its old contents, which is what makes the edit visible'

  assert.strictEqual(readFile(beforeImage, 'utf8'), 'one\ntwo\nthree\nfour\n', reason)
})
