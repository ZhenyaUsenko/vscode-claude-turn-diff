const turn = require('../src/turn')
const { projectKey } = require('../src/util/paths')
const {
  check, createRepo, commitAll, write, runTurn, manifest, statuses, registerChat, nextSecond,
} = require('./support')
const assert = require('assert')
const fs = require('fs')
const path = require('path')

check('reports A, M and D with correct before-images', async () => {
  const repo = createRepo()

  write(path.join(repo, 'keep.txt'), 'one\n')
  write(path.join(repo, 'gone.txt'), 'bye\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    write(path.join(repo, 'keep.txt'), 'two\n')
    write(path.join(repo, 'added.txt'), 'new\n')
    fs.unlinkSync(path.join(repo, 'gone.txt'))
  })

  const modifiedEntry = manifest(repo).files.find((entry) => entry[0].endsWith('keep.txt'))
  const beforeContents = fs.readFileSync(modifiedEntry[1], 'utf8')

  assert.deepStrictEqual(statuses(repo), ['A added.txt', 'D gone.txt', 'M keep.txt'])
  assert.strictEqual(beforeContents, 'one\n', 'the before-image holds the pre-turn content')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file changed and changed back is not reported', async () => {
  const repo = createRepo()

  write(path.join(repo, 'a.txt'), 'same\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    write(path.join(repo, 'a.txt'), 'changed\n')
    write(path.join(repo, 'a.txt'), 'same\n')
    write(path.join(repo, 'b.txt'), 'real\n')
  })

  assert.deepStrictEqual(statuses(repo), ['A b.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('binary files are skipped', async () => {
  const repo = createRepo()

  fs.writeFileSync(path.join(repo, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))
  write(path.join(repo, 'notes.txt'), 'x\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    fs.writeFileSync(path.join(repo, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]))
    write(path.join(repo, 'notes.txt'), 'y\n')
  })

  const reason = 'the png cannot render in a multi-diff editor, so it must not be listed'

  assert.deepStrictEqual(statuses(repo), ['M notes.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('untracked files over the size cap are excluded from both snapshots', async () => {
  const repo = createRepo()

  write(path.join(repo, 'seed.txt'), 'x\n')
  commitAll(repo)
  fs.writeFileSync(path.join(repo, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 7))

  await runTurn(repo, 'chat', [repo], () => {
    fs.writeFileSync(path.join(repo, 'big.bin'), Buffer.alloc(2 * 1024 * 1024, 8))
    write(path.join(repo, 'seed.txt'), 'y\n')
  })

  assert.deepStrictEqual(statuses(repo), ['M seed.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a same-size edit is still seen when the snapshot lands a second later', async () => {
  const repo = createRepo()
  const project = projectKey(repo)

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)
  registerChat(repo, 'chat')

  await turn.handle('begin', project, { session_id: 'chat', prompt: 'p' }, [repo])
  await turn.handle('arm', project, { session_id: 'chat' }, [repo])

  write(path.join(repo, 'f.txt'), 'two\n')

  await nextSecond()
  await turn.handle('end', project, { session_id: 'chat' }, [repo])

  assert.deepStrictEqual(statuses(repo), ['M f.txt'])
})
