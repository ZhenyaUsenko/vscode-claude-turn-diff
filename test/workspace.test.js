const {
  assert, fs, path, paths, HOME, check, repoAt, commitAll, write, runTurn, manifest, statuses,
  vscode, turn, registerChat, projectKey,
} = require('./support')

const seedRepo = () => {
  const repo = repoAt()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  return repo
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn spanning two repositories produces one manifest', async () => {
  const repoA = seedRepo()
  const repoB = seedRepo()

  await runTurn(repoA, 'chat', [repoA, repoB], () => {
    write(path.join(repoA, 'f.txt'), 'two\n')
    write(path.join(repoB, 'f.txt'), 'three\n')
  })

  assert.strictEqual(manifest(repoA).files.length, 2, 'both repositories in one manifest')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file outside every repository is captured', async () => {
  const repo = seedRepo()
  const outside = path.join(HOME, 'outside', 'notes.md')

  write(outside, 'before\n')

  const mutate = () => {
    write(outside, 'after\n')
    write(path.join(repo, 'f.txt'), 'two\n')
  }

  await runTurn(repo, 'chat', [repo], mutate, { touch: [outside] })

  assert.deepStrictEqual(statuses(repo), ['M f.txt', 'M notes.md'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('arming a file outside the workspace watches it, once', async () => {
  const repo = seedRepo()
  const outside = path.join(HOME, 'watched', 'notes.md')

  write(outside, 'before\n')
  vscode.reset([repo])

  const mutate = () => {
    write(path.join(repo, 'f.txt'), 'two\n')
    write(outside, 'after\n')
  }

  const touch = [outside, outside, path.join(repo, 'f.txt')]

  await runTurn(repo, 'chat', [repo], mutate, { touch })

  const [watcher] = vscode.state.watchers

  assert.strictEqual(vscode.state.watchers.length, 1, 'the in-workspace file needs no watcher')
  assert.strictEqual(watcher.pattern.base.fsPath, path.dirname(outside))
  assert.ok(watcher.disposed, 'the turn releases its watchers when it ends')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a chat ending leaves a parallel chat mid-turn still watching', async () => {
  const repo = seedRepo()
  const project = projectKey(repo)
  const forA = path.join(HOME, 'chat-a', 'notes.md')
  const forB = path.join(HOME, 'chat-b', 'notes.md')

  write(forA, 'before\n')
  write(forB, 'before\n')
  vscode.reset([repo])
  registerChat(repo, 'b')

  await turn.handle('begin', project, { session_id: 'b', prompt: 'p' }, [repo])
  await turn.handle('arm', project, { session_id: 'b', tool_input: { file_path: forB } }, [repo])
  await runTurn(repo, 'a', [repo], () => write(forA, 'after\n'), { touch: [forA] })

  const watcherFor = (target) => {
    const directory = path.dirname(target)

    return vscode.state.watchers.find((watcher) => watcher.pattern.base.fsPath === directory)
  }

  assert.ok(watcherFor(forA).disposed, 'the chat that finished released its own')
  assert.ok(!watcherFor(forB).disposed, 'the chat still mid-turn keeps watching')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('two projects do not overwrite each other', async () => {
  const repoA = seedRepo()
  const repoB = seedRepo()

  await runTurn(repoA, 'chat-a', [repoA], () => write(path.join(repoA, 'f.txt'), 'A\n'))
  await runTurn(repoB, 'chat-b', [repoB], () => write(path.join(repoB, 'f.txt'), 'B\n'))

  const manifestA = paths.manifestFor(projectKey(repoA))
  const manifestB = paths.manifestFor(projectKey(repoB))
  const survived = "project A's before-image survived project B's turn"

  assert.notStrictEqual(manifestA, manifestB)
  assert.ok(fs.existsSync(manifest(repoA).files[0][1]), survived)
  assert.ok(fs.existsSync(manifest(repoB).files[0][1]))
})
