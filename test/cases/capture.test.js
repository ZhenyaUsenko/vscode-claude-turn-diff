import { readManifest } from '../../src/store/manifest.js'
import { getBeforeImagesDir, getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { getRealPath, outputFile, readFile, removeFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { nextSecond, readChangedFileNames, registerChat, runTurn } from '../utils/turn.js'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join, relative as getRelativePath } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBeforeImageFile = (project, manifest, fileName) => {
  const { beforeFile } = manifest.changes.find((change) => change.beforeFile.endsWith(fileName))

  return join(getBeforeImagesDir(project), beforeFile)
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

  const project = getProjectKey(repoDir)
  const preTurn = 'the before-image holds what the file held before the turn'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['added.txt', 'gone.txt', 'keep.txt'])
  assert.strictEqual(readFile(getBeforeImageFile(project, manifest, 'keep.txt'), 'utf8'), 'one\n', preTurn)
  assert.strictEqual(readFile(getBeforeImageFile(project, manifest, 'gone.txt'), 'utf8'), 'bye\n', 'and so does it')
  assert.ok(!existsSync(getBeforeImageFile(project, manifest, 'added.txt')), 'a created file has no before-image')
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
  assert.ok(!existsSync(getBeforeImageFile(getProjectKey(repoDir), manifest, 'added.txt')), reason)
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
  assert.strictEqual(readFile(getBeforeImageFile(getProjectKey(repoDir), manifest, 'gone.txt'), 'utf8'), '', reason)
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

check('an untracked binary is never hashed into the repository, whatever its size', async () => {
  const repoDir = createRepo()
  const bigBinary = Buffer.alloc(2 * 1024 * 1024)
  const smallBinary = Buffer.from([0x89, 0x50, 0, 1])

  outputFile(join(repoDir, 'seed.txt'), 'x\n')
  commitAll(repoDir)
  outputFile(join(repoDir, 'shrinks.bin'), bigBinary)
  outputFile(join(repoDir, 'grows.bin'), smallBinary)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    outputFile(join(repoDir, 'shrinks.bin'), smallBinary)
    outputFile(join(repoDir, 'grows.bin'), bigBinary)
    outputFile(join(repoDir, 'seed.txt'), 'y\n')
  })

  const hashArgs = ['-C', repoDir, 'hash-object', '--stdin']

  const bigBinaryId = execFileSync('git', hashArgs, { input: bigBinary }).toString().trim()
  const reason = 'a binary cannot render, so staging it would only cost a hash of it at every snapshot'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['seed.txt'])
  assert.throws(() => execFileSync('git', ['-C', repoDir, 'cat-file', '-e', bigBinaryId], { stdio: 'ignore' }), reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an untracked nested repository with no commit yet does not hide the other untracked files', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'seed.txt'), 'one\n')
  commitAll(repoDir)
  mkdirSync(join(repoDir, 'nested'))
  execFileSync('git', ['-C', join(repoDir, 'nested'), 'init', '-q'])
  outputFile(join(repoDir, 'nested', 'inner.txt'), 'x\n')

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'added.txt'), 'new\n'))

  const reason = 'git lists the nested repository as a directory and refuses to stage it, failing the whole batch'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['added.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an untracked text file is captured whatever its size', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)
  const bigText = 'x'.repeat(2 * 1024 * 1024)

  outputFile(join(repoDir, 'seed.txt'), 'one\n')
  commitAll(repoDir)
  outputFile(join(repoDir, 'big.log'), bigText)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'big.log'), 'tiny now\n'))

  const manifest = readManifest(project)
  const reason = 'left out of the first snapshot for its size, it would arrive as newly created'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['big.log'])
  assert.strictEqual(readFile(getBeforeImageFile(project, manifest, 'big.log'), 'utf8'), bigText, reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file too large to diff is left out, and the rest of its repository is still listed', async () => {
  const repoDir = createRepo()
  const hugeSize = 51 * 1024 * 1024

  outputFile(join(repoDir, 'huge.txt'), 'x'.repeat(hugeSize))
  outputFile(join(repoDir, 'small.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    outputFile(join(repoDir, 'huge.txt'), 'y'.repeat(hugeSize))
    outputFile(join(repoDir, 'small.txt'), 'two\n')
  })

  const reason = 'one large file must not take the repository\'s other changes down with it'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['small.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn is captured however many untracked files the repository holds', async () => {
  const repoDir = createRepo()
  const longDir = join(repoDir, 'a'.repeat(200), 'b'.repeat(200))

  outputFile(join(repoDir, 'seed.txt'), 'one\n')
  commitAll(repoDir)

  for (let index = 0; index < 4000; index++) outputFile(join(longDir, `${'c'.repeat(140)}-${index}.txt`), 'x\n')

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'added.txt'), 'new\n'))

  const reason = 'their paths together are longer than a command line allows, so they have to reach git another way'

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['added.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a same-size edit is still seen when the snapshot lands a second later', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)
  registerChat(repoDir, 'chat')

  await handleTurn('begin', project, { session_id: 'chat', prompt_id: 'racy' }, [repoDir])
  await handleTurn('arm', project, { session_id: 'chat', prompt_id: 'racy' }, [repoDir])

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

  assert.deepStrictEqual(moves, expectedMoves, reason)
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

  const beforeImageFile = getBeforeImageFile(getProjectKey(repoDir), manifest, 'f.txt')

  assert.strictEqual(readFile(beforeImageFile, 'utf8'), 'one\ntwo\nthree\nfour\n', reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('changes are ordered the way the explorer shows them', async () => {
  const repoDir = createRepo()
  const seeded = ['zebra.txt', 'Alpha.txt', 'src/util/b.js', 'src/a.js', 'old/moved.txt']

  for (const name of seeded) outputFile(join(repoDir, name), 'one\ntwo\nthree\nfour\n')

  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    for (const name of seeded.slice(0, -1)) outputFile(join(repoDir, name), 'CHANGED\ntwo\nthree\nfour\n')

    mkdirSync(join(repoDir, 'new'), { recursive: true })
    renameSync(join(repoDir, 'old', 'moved.txt'), join(repoDir, 'new', 'moved.txt'))
  })

  const root = getRealPath(repoDir)

  const order = readManifest(getProjectKey(repoDir)).changes.map((change) => {
    return getRelativePath(root, change.afterFile)
  })

  const expected = ['new/moved.txt', 'src/util/b.js', 'src/a.js', 'Alpha.txt', 'zebra.txt']
  const reason = 'folders come before files at every level, and a move sits where it landed'

  assert.deepStrictEqual(order, expected, reason)
})

