import { getManifestFile, getProjectKey } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo, outputFile } from '../utils/fixtures.js'
import { HOME } from '../utils/home.js'
import { readManifest, readStatuses, registerChat, runTurn } from '../utils/turn.js'
import * as vscode from '../utils/vscode-stub.js'
import assert from 'assert'
import { existsSync, writeFileSync } from 'fs'
import path from 'path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const seedRepo = () => {
  const repo = createRepo()

  outputFile(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  return repo
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getWatcher = (target) => {
  const dir = path.dirname(target)

  return vscode.state.watchers.find((watcher) => watcher.pattern.base.fsPath === dir)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn spanning two repositories produces one manifest', async () => {
  const repoA = seedRepo()
  const repoB = seedRepo()

  await runTurn(repoA, 'chat', [repoA, repoB], () => {
    outputFile(path.join(repoA, 'f.txt'), 'two\n')
    outputFile(path.join(repoB, 'f.txt'), 'three\n')
  })

  assert.strictEqual(readManifest(repoA).files.length, 2, 'both repositories in one manifest')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file outside every repository is captured', async () => {
  const repo = seedRepo()
  const outsideFile = path.join(HOME, 'outside', 'notes.md')

  outputFile(outsideFile, 'before\n')

  const mutate = () => {
    outputFile(outsideFile, 'after\n')
    outputFile(path.join(repo, 'f.txt'), 'two\n')
  }

  await runTurn(repo, 'chat', [repo], mutate, { touchedFiles: [outsideFile] })

  assert.deepStrictEqual(readStatuses(repo), ['M f.txt', 'M notes.md'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a binary file outside every repository is skipped, not counted', async () => {
  const repo = seedRepo()
  const outsideFile = path.join(HOME, 'outside', 'pic.png')

  writeFileSync(outsideFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))

  const mutate = () => {
    writeFileSync(outsideFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]))
    outputFile(path.join(repo, 'f.txt'), 'two\n')
  }

  await runTurn(repo, 'chat', [repo], mutate, { touchedFiles: [outsideFile] })

  const reason = 'a listed binary is counted in the title and then fails to render, so the count would lie'

  assert.deepStrictEqual(readStatuses(repo), ['M f.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('arming a file outside the workspace watches it, once', async () => {
  const repo = seedRepo()
  const outsideFile = path.join(HOME, 'watched', 'notes.md')

  outputFile(outsideFile, 'before\n')
  vscode.reset([repo])

  const mutate = () => {
    outputFile(path.join(repo, 'f.txt'), 'two\n')
    outputFile(outsideFile, 'after\n')
  }

  const touchedFiles = [outsideFile, outsideFile, path.join(repo, 'f.txt')]

  await runTurn(repo, 'chat', [repo], mutate, { touchedFiles })

  const [watcher] = vscode.state.watchers

  assert.strictEqual(vscode.state.watchers.length, 1, 'the in-workspace file needs no watcher')
  assert.strictEqual(watcher.pattern.base.fsPath, path.dirname(outsideFile))
  assert.ok(watcher.disposed, 'the turn releases its watchers when it ends')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a chat ending leaves a parallel chat mid-turn still watching', async () => {
  const repo = seedRepo()
  const project = getProjectKey(repo)
  const fileForA = path.join(HOME, 'chat-a', 'notes.md')
  const fileForB = path.join(HOME, 'chat-b', 'notes.md')

  outputFile(fileForA, 'before\n')
  outputFile(fileForB, 'before\n')
  vscode.reset([repo])
  registerChat(repo, 'b')

  await handleTurn('begin', project, { session_id: 'b', prompt: 'p' }, [repo])
  await handleTurn('arm', project, { session_id: 'b', tool_input: { file_path: fileForB } }, [repo])
  await runTurn(repo, 'a', [repo], () => outputFile(fileForA, 'after\n'), { touchedFiles: [fileForA] })

  assert.ok(getWatcher(fileForA).disposed, 'the chat that finished released its own')
  assert.ok(!getWatcher(fileForB).disposed, 'the chat still mid-turn keeps watching')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('two projects do not overwrite each other', async () => {
  const repoA = seedRepo()
  const repoB = seedRepo()

  await runTurn(repoA, 'chat-a', [repoA], () => outputFile(path.join(repoA, 'f.txt'), 'A\n'))
  await runTurn(repoB, 'chat-b', [repoB], () => outputFile(path.join(repoB, 'f.txt'), 'B\n'))

  const manifestFileA = getManifestFile(getProjectKey(repoA))
  const manifestFileB = getManifestFile(getProjectKey(repoB))

  const reason = 'project A\'s before-image survived project B\'s turn'

  assert.notStrictEqual(manifestFileA, manifestFileB)
  assert.ok(existsSync(readManifest(repoA).files[0].beforeImage), reason)
  assert.ok(existsSync(readManifest(repoB).files[0].beforeImage))
})
