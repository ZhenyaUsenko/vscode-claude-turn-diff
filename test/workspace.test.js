// Reach: several repositories in one workspace, files belonging to none of
// them, and isolation between projects.

const {
  assert, fs, path, paths, HOME, check, repoAt, commitAll, write, runTurn, manifest, statuses,
  vscode, turn, registerChat,
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

check('arming a file outside the workspace watches it, once', async () => {
  const repo = repoAt()
  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  const outside = path.join(HOME, 'watched', 'notes.md')
  write(outside, 'before\n')

  vscode.reset([repo])
  await runTurn(
    repo,
    'chat',
    [repo],
    () => {
      write(path.join(repo, 'f.txt'), 'two\n')
      write(outside, 'after\n')
    },
    { touch: [outside, outside, path.join(repo, 'f.txt')] },
  )

  assert.strictEqual(vscode.state.watchers.length, 1, 'the in-workspace file needs no watcher')
  assert.strictEqual(vscode.state.watchers[0].pattern.base.fsPath, path.dirname(outside))
  assert.ok(vscode.state.watchers[0].disposed, 'the turn releases its watchers when it ends')
})

check('a chat ending leaves a parallel chat mid-turn still watching', async () => {
  const repo = repoAt()
  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  const forA = path.join(HOME, 'chat-a', 'notes.md')
  const forB = path.join(HOME, 'chat-b', 'notes.md')
  write(forA, 'before\n')
  write(forB, 'before\n')

  vscode.reset([repo])
  registerChat(repo, 'b')
  await turn.handle('begin', repo, { session_id: 'b', prompt: 'p' }, [repo])
  await turn.handle('arm', repo, { session_id: 'b', tool_input: { file_path: forB } }, [repo])

  await runTurn(repo, 'a', [repo], () => write(forA, 'after\n'), { touch: [forA] })

  const watcherFor = (target) =>
    vscode.state.watchers.find((watcher) => watcher.pattern.base.fsPath === path.dirname(target))
  assert.ok(watcherFor(forA).disposed, 'the chat that finished released its own')
  assert.ok(!watcherFor(forB).disposed, 'the chat still mid-turn keeps watching')
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
