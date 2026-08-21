import { handleTurn } from '../../src/turn/index.js'
import { getManifestFile, getProjectKey } from '../../src/utils/paths.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo, write } from '../utils/fixtures.js'
import { HOME } from '../utils/home.js'
import { readManifest, readStatuses, registerChat, runTurn } from '../utils/turn.js'
import * as vscode from '../utils/vscode-stub.js'
import assert from 'assert'
import fs from 'fs'
import path from 'path'

const seedRepo = () => {
  const repo = createRepo()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  return repo
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const watcherFor = (target) => {
  const dir = path.dirname(target)

  return vscode.state.watchers.find((watcher) => watcher.pattern.base.fsPath === dir)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn spanning two repositories produces one manifest', async () => {
  const repoA = seedRepo()
  const repoB = seedRepo()

  await runTurn(repoA, 'chat', [repoA, repoB], () => {
    write(path.join(repoA, 'f.txt'), 'two\n')
    write(path.join(repoB, 'f.txt'), 'three\n')
  })

  assert.strictEqual(readManifest(repoA).files.length, 2, 'both repositories in one manifest')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file outside every repository is captured', async () => {
  const repo = seedRepo()
  const outsideFile = path.join(HOME, 'outside', 'notes.md')

  write(outsideFile, 'before\n')

  const mutate = () => {
    write(outsideFile, 'after\n')
    write(path.join(repo, 'f.txt'), 'two\n')
  }

  await runTurn(repo, 'chat', [repo], mutate, { touch: [outsideFile] })

  assert.deepStrictEqual(readStatuses(repo), ['M f.txt', 'M notes.md'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a binary file outside every repository is skipped, not counted', async () => {
  const repo = seedRepo()
  const outsideFile = path.join(HOME, 'outside', 'pic.png')

  fs.writeFileSync(outsideFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]))

  const mutate = () => {
    fs.writeFileSync(outsideFile, Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]))
    write(path.join(repo, 'f.txt'), 'two\n')
  }

  await runTurn(repo, 'chat', [repo], mutate, { touch: [outsideFile] })

  const reason = 'a listed binary is counted in the title and then fails to render, so the count would lie'

  assert.deepStrictEqual(readStatuses(repo), ['M f.txt'], reason)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('arming a file outside the workspace watches it, once', async () => {
  const repo = seedRepo()
  const outsideFile = path.join(HOME, 'watched', 'notes.md')

  write(outsideFile, 'before\n')
  vscode.reset([repo])

  const mutate = () => {
    write(path.join(repo, 'f.txt'), 'two\n')
    write(outsideFile, 'after\n')
  }

  const touchedFiles = [outsideFile, outsideFile, path.join(repo, 'f.txt')]

  await runTurn(repo, 'chat', [repo], mutate, { touch: touchedFiles })

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

  write(fileForA, 'before\n')
  write(fileForB, 'before\n')
  vscode.reset([repo])
  registerChat(repo, 'b')

  await handleTurn('begin', project, { session_id: 'b', prompt: 'p' }, [repo])
  await handleTurn('arm', project, { session_id: 'b', tool_input: { file_path: fileForB } }, [repo])
  await runTurn(repo, 'a', [repo], () => write(fileForA, 'after\n'), { touch: [fileForA] })

  assert.ok(watcherFor(fileForA).disposed, 'the chat that finished released its own')
  assert.ok(!watcherFor(fileForB).disposed, 'the chat still mid-turn keeps watching')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('two projects do not overwrite each other', async () => {
  const repoA = seedRepo()
  const repoB = seedRepo()

  await runTurn(repoA, 'chat-a', [repoA], () => write(path.join(repoA, 'f.txt'), 'A\n'))
  await runTurn(repoB, 'chat-b', [repoB], () => write(path.join(repoB, 'f.txt'), 'B\n'))

  const manifestFileA = getManifestFile(getProjectKey(repoA))
  const manifestFileB = getManifestFile(getProjectKey(repoB))
  const survived = 'project A\'s before-image survived project B\'s turn'

  assert.notStrictEqual(manifestFileA, manifestFileB)
  assert.ok(fs.existsSync(readManifest(repoA).files[0][1]), survived)
  assert.ok(fs.existsSync(readManifest(repoB).files[0][1]))
})
