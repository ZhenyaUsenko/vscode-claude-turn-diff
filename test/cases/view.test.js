import { readManifest } from '../../src/store/manifest.js'
import { getProjectKey } from '../../src/store/paths.js'
import { getRealPath, outputFile, removeFile } from '../../src/utils/files.js'
import { registerBeforeImageProvider, showLastTurn } from '../../src/view.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { nextSecond, runTurn } from '../utils/turn.js'
import { resetStub, stubState, Uri } from '../utils/vscode-stub.js'
import assert from 'node:assert'
import { mkdirSync, renameSync } from 'node:fs'
import { basename, join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getEntry = (diffData, name) => {
  return diffData.resources.find(([fileUri]) => basename(fileUri.fsPath) === name)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBeforeUri = (absolutePath, stamp) => {
  return Uri.file(absolutePath).with({ scheme: 'claude-before', query: stamp })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getBeforeText = (uri) => {
  return stubState.provider.readFile(uri).toString()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const render = async (workspaceFolders) => {
  resetStub(workspaceFolders)

  await showLastTurn({ force: true })

  return stubState.executed[stubState.executed.length - 1]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('A, M and D become the right pair of sides, with no rename inferred', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'keep.txt'), 'one\n')
  outputFile(join(repo, 'gone.txt'), 'bye\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    outputFile(join(repo, 'keep.txt'), 'two\n')
    outputFile(join(repo, 'added.txt'), 'new\n')
    removeFile(join(repo, 'gone.txt'))
  })

  const diffData = await render([repo])
  const [file, original, modified] = getEntry(diffData, 'keep.txt')
  const renameRule = 'the editor infers a rename from differing paths, so only the scheme may differ'

  assert.strictEqual(diffData.command, 'vscode.changes')
  assert.strictEqual(original.scheme, 'claude-before', 'M reads from the before-image')
  assert.strictEqual(modified.fsPath, file.fsPath, 'M writes to the real file')
  assert.strictEqual(original.path, modified.path, renameRule)
  assert.strictEqual(getEntry(diffData, 'added.txt')[1], undefined, 'A has no left side')
  assert.strictEqual(getEntry(diffData, 'gone.txt')[2], undefined, 'D has no right side')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('each turn addresses its before-image by a distinct uri', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => outputFile(join(repo, 'f.txt'), 'two\n'))

  const firstUri = getEntry(await render([repo]), 'f.txt')[1]

  await nextSecond()
  await runTurn(repo, 'chat', [repo], () => outputFile(join(repo, 'f.txt'), 'three\n'))

  const secondUri = getEntry(await render([repo]), 'f.txt')[1]
  const reason = 'a reused uri lets VS Code serve the previous turn from its model cache'

  assert.notStrictEqual(firstUri.toString(), secondUri.toString(), reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('the before-image provider serves that turn, and nothing it does not know', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'f.txt'), 'before\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => outputFile(join(repo, 'f.txt'), 'after\n'))

  registerBeforeImageProvider()

  const original = getEntry(await render([repo]), 'f.txt')[1]
  const unknownUriReason = 'a uri it cannot serve must throw, so the editor keeps what it has instead of blanking'

  assert.strictEqual(getBeforeText(original), 'before\n')
  assert.strictEqual(stubState.provider.stat(original).size, 'before\n'.length, 'stat agrees with readFile')
  assert.throws(() => getBeforeText(Uri.file('/nope')), unknownUriReason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a before-image resolves with no render to prime it, as after a restart', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'f.txt'), 'before\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => outputFile(join(repo, 'f.txt'), 'after\n'))

  resetStub([repo])
  registerBeforeImageProvider()

  const { ts, files } = readManifest(getProjectKey(repo))
  const { beforePath } = files[0]

  const beforeUri = getBeforeUri(beforePath, ts)
  const restartReason = 'a restored editor asks for its uri directly, so the provider cannot rely on a render'

  assert.strictEqual(getBeforeText(beforeUri), 'before\n', restartReason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file reverted by hand drops out of the diff', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'f.txt'), 'one\n')
  outputFile(join(repo, 'g.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    outputFile(join(repo, 'f.txt'), 'two\n')
    outputFile(join(repo, 'g.txt'), 'two\n')
  })

  outputFile(join(repo, 'f.txt'), 'one\n')

  const diffData = await render([repo])
  const renderedNames = diffData.resources.map(([fileUri]) => basename(fileUri.fsPath))

  assert.deepStrictEqual(renderedNames, ['g.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a move renders with its sides on different paths, so a rename is inferred', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'old', 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => {
    mkdirSync(join(repo, 'new'), { recursive: true })
    renameSync(join(repo, 'old', 'f.txt'), join(repo, 'new', 'f.txt'))
  })

  const root = getRealPath(repo)
  const diffData = await render([repo])
  const [fileUri, original, modified] = getEntry(diffData, 'f.txt')
  const renameRule = 'the editor infers the rename from the two sides naming different paths'

  assert.strictEqual(diffData.resources.length, 1, 'a move is one entry, not a delete beside an add')
  assert.strictEqual(fileUri.fsPath, join(root, 'new', 'f.txt'), 'the entry is named by where it landed')
  assert.strictEqual(original.path, join(root, 'old', 'f.txt'), renameRule)
  assert.strictEqual(modified.path, join(root, 'new', 'f.txt'), renameRule)
})
