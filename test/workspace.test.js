// Reach: several repositories in one workspace, files belonging to none of
// them, and isolation between projects.

const {
  assert, fs, path, paths, HOME, check, repoAt, commitAll, write, runTurn, manifest, statuses,
} = require('./support')

check('a turn spanning two repositories produces one manifest', async () => {
  const repoA = repoAt()
  const repoB = repoAt()
  for (const repo of [repoA, repoB]) {
    write(path.join(repo, 'f.txt'), 'one\n')
    commitAll(repo)
  }

  await runTurn(repoA, 'chat', [repoA, repoB], () => {
    write(path.join(repoA, 'f.txt'), 'two\n')
    write(path.join(repoB, 'f.txt'), 'three\n')
  })

  assert.strictEqual(manifest(repoA).files.length, 2, 'both repositories in one manifest')
})

check('a file outside every repository is captured', async () => {
  const repo = repoAt()
  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  const outside = path.join(HOME, 'outside', 'notes.md')
  write(outside, 'before\n')

  await runTurn(
    repo,
    'chat',
    [repo],
    () => {
      write(outside, 'after\n')
      write(path.join(repo, 'f.txt'), 'two\n')
    },
    { touch: [outside] },
  )

  assert.deepStrictEqual(statuses(repo), ['M f.txt', 'M notes.md'])
})

check('two projects do not overwrite each other', async () => {
  const repoA = repoAt()
  const repoB = repoAt()
  for (const repo of [repoA, repoB]) {
    write(path.join(repo, 'f.txt'), 'one\n')
    commitAll(repo)
  }

  await runTurn(repoA, 'chat-a', [repoA], () => write(path.join(repoA, 'f.txt'), 'A\n'))
  await runTurn(repoB, 'chat-b', [repoB], () => write(path.join(repoB, 'f.txt'), 'B\n'))

  assert.notStrictEqual(paths.manifestFor(repoA), paths.manifestFor(repoB))
  assert.ok(
    fs.existsSync(manifest(repoA).files[0][1]),
    "project A's before-image survived project B's turn",
  )
  assert.ok(fs.existsSync(manifest(repoB).files[0][1]))
})
