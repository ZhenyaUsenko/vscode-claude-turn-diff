// The rendering half: what the manifest turns into for the multi-diff editor.

const {
  assert, fs, path, HOME, check, repoAt, commitAll, write, runTurn, nextSecond, view, vscode,
} = require('./support')

const render = async (workingDir, folders) => {
  vscode.reset(folders)
  await view.showLastTurn({ force: true })
  return vscode.state.executed[vscode.state.executed.length - 1]
}

const entryFor = (call, name) =>
  call.resources.find(([fileUri]) => path.basename(fileUri.fsPath) === name)

check('A, M and D become the right pair of sides, with no rename inferred', async () => {
  const repo = repoAt()
  write(path.join(repo, 'keep.txt'), 'one\n')
  write(path.join(repo, 'gone.txt'), 'bye\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    write(path.join(repo, 'keep.txt'), 'two\n')
    write(path.join(repo, 'added.txt'), 'new\n')
    fs.unlinkSync(path.join(repo, 'gone.txt'))
  })

  const call = await render(repo, [repo])
  assert.strictEqual(call.command, 'vscode.changes')

  const [file, original, modified] = entryFor(call, 'keep.txt')
  assert.strictEqual(original.scheme, 'claude-before', 'M reads from the before-image')
  assert.strictEqual(modified.fsPath, file.fsPath, 'M writes to the real file')
  assert.strictEqual(
    original.path,
    modified.path,
    'the editor infers a rename from differing paths, so only the scheme may differ',
  )

  assert.strictEqual(entryFor(call, 'added.txt')[1], undefined, 'A has no left side')
  assert.strictEqual(entryFor(call, 'gone.txt')[2], undefined, 'D has no right side')
})

check('each turn addresses its before-image by a distinct uri', async () => {
  const repo = repoAt()
  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))
  const first = entryFor(await render(repo, [repo]), 'f.txt')[1]

  await nextSecond()
  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'three\n'))
  const second = entryFor(await render(repo, [repo]), 'f.txt')[1]

  assert.notStrictEqual(
    first.toString(),
    second.toString(),
    'a reused uri lets VS Code serve the previous turn from its model cache',
  )
})

check('the before-image provider serves that turn, and nothing it does not know', async () => {
  const repo = repoAt()
  write(path.join(repo, 'f.txt'), 'before\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'after\n'))

  view.registerBeforeImageProvider()
  const original = entryFor(await render(repo, [repo]), 'f.txt')[1]

  assert.strictEqual(vscode.state.provider.provideTextDocumentContent(original), 'before\n')
  assert.strictEqual(
    vscode.state.provider.provideTextDocumentContent(vscode.Uri.file('/nope')),
    '',
    'an unknown uri resolves to empty rather than throwing',
  )
})

check('a file reverted by hand drops out of the diff', async () => {
  const repo = repoAt()
  write(path.join(repo, 'f.txt'), 'one\n')
  write(path.join(repo, 'g.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    write(path.join(repo, 'f.txt'), 'two\n')
    write(path.join(repo, 'g.txt'), 'two\n')
  })
  write(path.join(repo, 'f.txt'), 'one\n')

  const call = await render(repo, [repo])
  assert.deepStrictEqual(
    call.resources.map(([fileUri]) => path.basename(fileUri.fsPath)),
    ['g.txt'],
  )
})
