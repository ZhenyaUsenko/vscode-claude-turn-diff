import { readManifest } from '../../src/store/manifest.js'
import { getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { getRealPath, outputFile, removeFile } from '../../src/utils/files.js'
import { registerBeforeImageProvider } from '../../src/view.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { getRenderedFileNames, listExecutedCommands, render } from '../utils/render.js'
import { runTurn, startTurn } from '../utils/turn.js'
import { resetStub, stubState, Uri } from '../utils/vscode-stub.js'
import assert from 'node:assert'
import { mkdirSync, renameSync } from 'node:fs'
import { basename, join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getResource = (diffData, fileName) => {
  return diffData.resources.find(([resourceUri]) => basename(resourceUri.fsPath) === fileName)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readContents = (uri) => {
  return stubState.provider.readFile(uri).toString()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('A, M and D become the right pair of sides, with no rename inferred', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'keep.txt'), 'one\n')
  outputFile(join(repoDir, 'gone.txt'), 'bye\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    outputFile(join(repoDir, 'keep.txt'), 'two\n')
    outputFile(join(repoDir, 'added.txt'), 'new\n')
    removeFile(join(repoDir, 'gone.txt'))
  })

  const diffData = await render([repoDir])
  const [resourceUri, beforeUri, afterUri] = getResource(diffData, 'keep.txt')
  const renameRule = 'the editor infers a rename from differing paths, so only the scheme may differ'

  assert.strictEqual(diffData.command, 'vscode.changes')
  assert.strictEqual(beforeUri.scheme, 'claude-before', 'M reads from the before-image')
  assert.strictEqual(afterUri.fsPath, resourceUri.fsPath, 'M writes to the real file')
  assert.strictEqual(beforeUri.path, afterUri.path, renameRule)
  assert.strictEqual(getResource(diffData, 'added.txt')[1], undefined, 'A has no left side')
  assert.strictEqual(getResource(diffData, 'gone.txt')[2], undefined, 'D has no right side')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('each turn addresses its before-image by a distinct uri', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  const firstUri = getResource(await render([repoDir]), 'f.txt')[1]

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'three\n'))

  const secondUri = getResource(await render([repoDir]), 'f.txt')[1]
  const reason = 'a reused uri lets VS Code serve the previous turn from its model cache'

  assert.notStrictEqual(firstUri.toString(), secondUri.toString(), reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('the before-image provider serves that turn, and nothing it does not know', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'before\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'after\n'))

  registerBeforeImageProvider()

  const beforeUri = getResource(await render([repoDir]), 'f.txt')[1]
  const unknownUriReason = 'a uri it cannot serve must throw, so the editor keeps what it has instead of blanking'

  assert.strictEqual(readContents(beforeUri), 'before\n')
  assert.strictEqual(stubState.provider.stat(beforeUri).size, 'before\n'.length, 'stat agrees with readFile')
  assert.throws(() => readContents(Uri.file('/nope')), unknownUriReason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a before-image resolves with no render to prime it, as after a restart', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'before\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'after\n'))

  resetStub([repoDir])
  registerBeforeImageProvider()

  const { id, changes } = readManifest(getProjectKey(repoDir))
  const { beforeFile } = changes[0]

  const beforeUri = Uri.file(beforeFile).with({ scheme: 'claude-before', query: id })
  const restartReason = 'a restored editor asks for its uri directly, so the provider cannot rely on a render'

  assert.strictEqual(readContents(beforeUri), 'before\n', restartReason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an emptied and a deleted empty file both reach the editor', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'gone.txt'), '')
  outputFile(join(repoDir, 'emptied.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    removeFile(join(repoDir, 'gone.txt'))
    outputFile(join(repoDir, 'emptied.txt'), '')
  })

  registerBeforeImageProvider()

  const diffData = await render([repoDir])
  const [, deletedBeforeUri, deletedAfterUri] = getResource(diffData, 'gone.txt')
  const [, emptiedBeforeUri] = getResource(diffData, 'emptied.txt')

  const zeroBytes = 'a zero-byte before-image must be served as empty, not as FileNotFound'

  assert.strictEqual(diffData.resources.length, 2, 'both entries are listed')
  assert.strictEqual(deletedAfterUri, undefined, 'D has no right side')
  assert.strictEqual(stubState.provider.stat(deletedBeforeUri).size, 0, zeroBytes)
  assert.strictEqual(readContents(deletedBeforeUri), '', zeroBytes)
  assert.strictEqual(readContents(emptiedBeforeUri), 'one\n', 'the emptied file still has its old text')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file reverted by hand drops out of the diff', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  outputFile(join(repoDir, 'g.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    outputFile(join(repoDir, 'f.txt'), 'two\n')
    outputFile(join(repoDir, 'g.txt'), 'two\n')
  })

  outputFile(join(repoDir, 'f.txt'), 'one\n')

  assert.deepStrictEqual(getRenderedFileNames(await render([repoDir])), ['g.txt'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a move renders with its sides on different paths, so a rename is inferred', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'old', 'f.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => {
    mkdirSync(join(repoDir, 'new'), { recursive: true })
    renameSync(join(repoDir, 'old', 'f.txt'), join(repoDir, 'new', 'f.txt'))
  })

  const diffData = await render([repoDir])
  const [resourceUri, beforeUri, afterUri] = getResource(diffData, 'f.txt')
  const renameRule = 'the editor infers the rename from the two sides naming different paths'

  const oldFile = join(getRealPath(repoDir), 'old', 'f.txt')
  const newFile = join(getRealPath(repoDir), 'new', 'f.txt')

  assert.strictEqual(diffData.resources.length, 1, 'a move is one entry, not a delete beside an add')
  assert.strictEqual(resourceUri.fsPath, newFile, 'the entry is named by where it landed')
  assert.strictEqual(beforeUri.path, oldFile, renameRule)
  assert.strictEqual(afterUri.path, newFile, renameRule)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a before-image from a superseded turn is refused, not quietly replaced', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  registerBeforeImageProvider()

  const supersededUri = getResource(await render([repoDir]), 'f.txt')[1]

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'three\n'))

  const reason = 'one directory holds every turn, so only the stamp keeps an old tab off the new contents'

  assert.throws(() => readContents(supersededUri), reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that only adds files still renders', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'seed.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'added.txt'), 'new\n'))

  const diffData = await render([repoDir])
  const reason = 'no before-image was written, so the directory has to exist on its own account'

  assert.deepStrictEqual(getRenderedFileNames(diffData), ['added.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('the diff of a finished turn is kept, so the next thing to open cannot replace it', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))
  await render([repoDir])

  const reason = 'vscode.changes opens a preview tab and takes no options, so the tab is kept right after it opens'

  assert.deepStrictEqual(listExecutedCommands(), ['vscode.changes', 'workbench.action.keepEditor'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an empty diff and a look at a running turn stay previews', async () => {
  const repoDir = createRepo()
  const project = getProjectKey(repoDir)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await render([repoDir])

  const emptyReason = 'an editor with nothing in it is not worth keeping'

  assert.deepStrictEqual(listExecutedCommands(), ['vscode.changes'], emptyReason)

  await startTurn(repoDir, 'chat', [repoDir])

  outputFile(join(repoDir, 'f.txt'), 'two\n')

  await render([repoDir])

  const runningReason = 'every look would leave a tab behind, where a preview gives way to the next look or final diff'

  assert.deepStrictEqual(listExecutedCommands(), ['vscode.changes'], runningReason)

  await handleTurn('end', project, { session_id: 'chat' }, [repoDir])
})
