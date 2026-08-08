const { assert, fs, path, check, repoAt, commitAll, write, runTurn, nextSecond, view, vscode } = require('./support')

const entryFor = (call, name) => call.resources.find(([fileUri]) => path.basename(fileUri.fsPath) === name)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const render = async (folders) => {
  vscode.reset(folders)

  await view.showLastTurn({ force: true })

  return vscode.state.executed[vscode.state.executed.length - 1]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

  const call = await render([repo])
  const [file, original, modified] = entryFor(call, 'keep.txt')
  const renameRule = 'the editor infers a rename from differing paths, so only the scheme may differ'

  assert.strictEqual(call.command, 'vscode.changes')
  assert.strictEqual(original.scheme, 'claude-before', 'M reads from the before-image')
  assert.strictEqual(modified.fsPath, file.fsPath, 'M writes to the real file')
  assert.strictEqual(original.path, modified.path, renameRule)
  assert.strictEqual(entryFor(call, 'added.txt')[1], undefined, 'A has no left side')
  assert.strictEqual(entryFor(call, 'gone.txt')[2], undefined, 'D has no right side')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('each turn addresses its before-image by a distinct uri', async () => {
  const repo = repoAt()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const first = entryFor(await render([repo]), 'f.txt')[1]

  await nextSecond()
  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'three\n'))

  const second = entryFor(await render([repo]), 'f.txt')[1]
  const reason = 'a reused uri lets VS Code serve the previous turn from its model cache'

  assert.notStrictEqual(first.toString(), second.toString(), reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('the before-image provider serves that turn, and nothing it does not know', async () => {
  const repo = repoAt()

  write(path.join(repo, 'f.txt'), 'before\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'after\n'))

  view.registerBeforeImageProvider()

  const original = entryFor(await render([repo]), 'f.txt')[1]
  const { provider } = vscode.state
  const unknown = 'an unknown uri resolves to empty rather than throwing'

  assert.strictEqual(provider.provideTextDocumentContent(original), 'before\n')
  assert.strictEqual(provider.provideTextDocumentContent(vscode.Uri.file('/nope')), '', unknown)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

  const call = await render([repo])
  const rendered = call.resources.map(([fileUri]) => path.basename(fileUri.fsPath))

  assert.deepStrictEqual(rendered, ['g.txt'])
})
