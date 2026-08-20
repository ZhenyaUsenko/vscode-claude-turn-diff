import * as view from '../src/view.js'
import { check, createRepo, commitAll, write, runTurn, nextSecond, manifest } from './support.js'
import * as vscode from './vscode-stub.js'
import assert from 'assert'
import fs from 'fs'
import path from 'path'

const entryFor = (changesCall, name) => {
  return changesCall.resources.find(([fileUri]) => path.basename(fileUri.fsPath) === name)
}

const beforeUriFor = (absolutePath, stamp) => {
  return vscode.Uri.file(absolutePath).with({ scheme: 'claude-before', query: stamp })
}

const beforeText = (uri) => Buffer.from(vscode.state.provider.readFile(uri)).toString()

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const render = async (workspaceFolders) => {
  vscode.reset(workspaceFolders)

  await view.showLastTurn({ force: true })

  return vscode.state.executed[vscode.state.executed.length - 1]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('A, M and D become the right pair of sides, with no rename inferred', async () => {
  const repo = createRepo()

  write(path.join(repo, 'keep.txt'), 'one\n')
  write(path.join(repo, 'gone.txt'), 'bye\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    write(path.join(repo, 'keep.txt'), 'two\n')
    write(path.join(repo, 'added.txt'), 'new\n')
    fs.unlinkSync(path.join(repo, 'gone.txt'))
  })

  const changesCall = await render([repo])
  const [file, original, modified] = entryFor(changesCall, 'keep.txt')
  const renameRule = 'the editor infers a rename from differing paths, so only the scheme may differ'

  assert.strictEqual(changesCall.command, 'vscode.changes')
  assert.strictEqual(original.scheme, 'claude-before', 'M reads from the before-image')
  assert.strictEqual(modified.fsPath, file.fsPath, 'M writes to the real file')
  assert.strictEqual(original.path, modified.path, renameRule)
  assert.strictEqual(entryFor(changesCall, 'added.txt')[1], undefined, 'A has no left side')
  assert.strictEqual(entryFor(changesCall, 'gone.txt')[2], undefined, 'D has no right side')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('each turn addresses its before-image by a distinct uri', async () => {
  const repo = createRepo()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const firstUri = entryFor(await render([repo]), 'f.txt')[1]

  await nextSecond()
  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'three\n'))

  const secondUri = entryFor(await render([repo]), 'f.txt')[1]
  const reason = 'a reused uri lets VS Code serve the previous turn from its model cache'

  assert.notStrictEqual(firstUri.toString(), secondUri.toString(), reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('the before-image provider serves that turn, and nothing it does not know', async () => {
  const repo = createRepo()

  write(path.join(repo, 'f.txt'), 'before\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'after\n'))

  view.registerBeforeImageProvider()

  const original = entryFor(await render([repo]), 'f.txt')[1]
  const unknownUriReason = 'a uri it cannot serve must throw, so the editor keeps what it has instead of blanking'

  assert.strictEqual(beforeText(original), 'before\n')
  assert.strictEqual(vscode.state.provider.stat(original).size, 'before\n'.length, 'stat agrees with readFile')
  assert.throws(() => beforeText(vscode.Uri.file('/nope')), unknownUriReason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a before-image resolves with no render to prime it, as after a restart', async () => {
  const repo = createRepo()

  write(path.join(repo, 'f.txt'), 'before\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'after\n'))

  vscode.reset([repo])
  view.registerBeforeImageProvider()

  const { ts, files } = manifest(repo)
  const [absolutePath] = files[0]

  const beforeUri = beforeUriFor(absolutePath, ts)
  const restartReason = 'a restored editor asks for its uri directly, so the provider cannot rely on a render'

  assert.strictEqual(beforeText(beforeUri), 'before\n', restartReason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file reverted by hand drops out of the diff', async () => {
  const repo = createRepo()

  write(path.join(repo, 'f.txt'), 'one\n')
  write(path.join(repo, 'g.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    write(path.join(repo, 'f.txt'), 'two\n')
    write(path.join(repo, 'g.txt'), 'two\n')
  })

  write(path.join(repo, 'f.txt'), 'one\n')

  const changesCall = await render([repo])
  const renderedNames = changesCall.resources.map(([fileUri]) => path.basename(fileUri.fsPath))

  assert.deepStrictEqual(renderedNames, ['g.txt'])
})
