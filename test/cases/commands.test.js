import { readManifest } from '../../src/store/manifest.js'
import { getBeforeImagesDir, getProjectKey, getTouchListFile } from '../../src/store/paths.js'
import { handleTurn } from '../../src/turn/index.js'
import { outputFile, readFile, readLines, removeFile, removeRecursive } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { HOME } from '../utils/home.js'
import { readChangedFileNames, runTurn, startTurn } from '../utils/turn.js'
import { resetStub, stubState } from '../utils/vscode-stub.js'
import assert from 'node:assert'
import { mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let outsideCounter = 0

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const createOutsideDir = () => {
  const outsideDir = join(HOME, `outside-${outsideCounter++}`)

  mkdirSync(outsideDir, { recursive: true })

  return outsideDir
}

const seedRepo = () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  return repoDir
}

const readBeforeImage = (repoDir, file) => {
  return readFile(join(getBeforeImagesDir(getProjectKey(repoDir)), file), 'utf8')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a file removed by a shell command outside every repository is captured', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()
  const notesFile = join(outsideDir, 'notes.md')

  outputFile(notesFile, 'gone\n')

  const commands = [{ command: 'rm notes.md', cwd: outsideDir }]

  await runTurn(repoDir, 'chat', [repoDir], () => removeFile(notesFile), { commands })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['notes.md'])
  assert.strictEqual(readBeforeImage(repoDir, notesFile), 'gone\n', 'the before-image holds what rm deleted')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a move outside every repository yields both halves', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()

  outputFile(join(outsideDir, 'old.md'), 'text\n')

  const commands = [{ command: 'mv old.md new.md', cwd: outsideDir }]
  const move = () => renameSync(join(outsideDir, 'old.md'), join(outsideDir, 'new.md'))

  await runTurn(repoDir, 'chat', [repoDir], move, { commands })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['new.md', 'old.md'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a copied file is captured too, since a copy is often a backup before an edit', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()
  const sourceFile = join(outsideDir, 'a.md')

  outputFile(sourceFile, 'one\n')

  const commands = [{ command: 'cp a.md a.md.bak && sed -i "" s/one/two/ a.md', cwd: outsideDir }]

  const edit = () => {
    outputFile(join(outsideDir, 'a.md.bak'), 'one\n')
    outputFile(sourceFile, 'two\n')
  }

  await runTurn(repoDir, 'chat', [repoDir], edit, { commands })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['a.md', 'a.md.bak'])
  assert.strictEqual(readBeforeImage(repoDir, sourceFile), 'one\n')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a redirect and a heredoc script create files that are recorded before they exist', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()
  const script = 'python3 - <<\'PY\'\nopen(\'gen/out.md\', \'w\').write(\'x\')\nPY'

  const commands = [{ command: 'echo hi > created.md', cwd: outsideDir }, { command: script, cwd: outsideDir }]

  const create = () => {
    outputFile(join(outsideDir, 'created.md'), 'hi\n')
    outputFile(join(outsideDir, 'gen', 'out.md'), 'x')
  }

  await runTurn(repoDir, 'chat', [repoDir], create, { commands })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['out.md', 'created.md'], 'folders sort before files')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a script composing a directory with a bare file name still reaches the file', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()
  const noteFile = join(outsideDir, 'memory', 'note.md')

  outputFile(noteFile, 'one\n')

  const script = `python3 - <<'PY'\nbase = Path('${outsideDir}/memory')\n(base / 'note.md').write_text('two')\nPY`
  const commands = [{ command: script, cwd: outsideDir }]

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(noteFile, 'two\n'), { commands })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['note.md'])
  assert.strictEqual(readBeforeImage(repoDir, noteFile), 'one\n')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a recursive removal captures every file under the directory, skipping node_modules', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()
  const doomedDir = join(outsideDir, 'doomed')

  outputFile(join(doomedDir, 'a.md'), 'a\n')
  outputFile(join(doomedDir, 'nested', 'b.md'), 'b\n')
  outputFile(join(doomedDir, 'node_modules', 'dep', 'index.js'), 'dep\n')

  const commands = [{ command: 'rm -rf doomed', cwd: outsideDir }]

  await runTurn(repoDir, 'chat', [repoDir], () => removeRecursive(doomedDir), { commands })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['b.md', 'a.md'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a glob is expanded when the command is armed', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()

  outputFile(join(outsideDir, 'one.log'), '1\n')
  outputFile(join(outsideDir, 'two.log'), '2\n')
  outputFile(join(outsideDir, 'keep.txt'), 'k\n')

  const commands = [{ command: 'rm *.log', cwd: outsideDir }]

  const removeLogs = () => {
    removeFile(join(outsideDir, 'one.log'))
    removeFile(join(outsideDir, 'two.log'))
  }

  await runTurn(repoDir, 'chat', [repoDir], removeLogs, { commands })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['one.log', 'two.log'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a cd inside the command moves the working directory for what follows', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()
  const targetFile = join(outsideDir, 'sub', 'x.md')

  outputFile(targetFile, 'x\n')

  const commands = [{ command: 'cd sub && rm x.md', cwd: outsideDir }]

  await runTurn(repoDir, 'chat', [repoDir], () => removeFile(targetFile), { commands })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['x.md'])
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a path inside a repository is left to the snapshot', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)

  const commands = [{ command: 'rm f.txt', cwd: repoDir }]

  await runTurn(repoDir, 'chat', [repoDir], () => removeFile(join(repoDir, 'f.txt')), { commands })

  assert.deepStrictEqual(readChangedFileNames(repoDir), ['f.txt'], 'the deletion still shows, from the tree diff')
  assert.deepStrictEqual(readLines(getTouchListFile(project)), [], 'nothing was copied aside for it')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a recorded creation that never happens is not a change', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()

  const commands = [{ command: 'echo hi > never.md', cwd: outsideDir }]

  await runTurn(repoDir, 'chat', [repoDir], () => {}, { commands })

  assert.strictEqual(readManifest(getProjectKey(repoDir)), undefined, 'nothing changed, so nothing was published')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('files a command touches outside the workspace are watched by directory', async () => {
  const repoDir = seedRepo()
  const outsideDir = createOutsideDir()

  outputFile(join(outsideDir, 'a.md'), 'a\n')
  outputFile(join(outsideDir, 'b.md'), 'b\n')
  resetStub([repoDir])

  const commands = [{ command: 'rm a.md b.md', cwd: outsideDir }]

  await runTurn(repoDir, 'chat', [repoDir], () => {}, { commands })

  assert.strictEqual(stubState.watchers.length, 1, 'one watcher covers the directory')
  assert.strictEqual(stubState.watchers[0].pattern.base.fsPath, outsideDir)
  assert.strictEqual(stubState.watchers[0].pattern.pattern, '*')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('past the cap the directory watched longest gives way, unless the command names it again', async () => {
  const repoDir = seedRepo()
  const project = getProjectKey(repoDir)
  const outsideDir = createOutsideDir()
  const names = Array.from({ length: 101 }, (unused, index) => `d${index}/a.md`)

  const isWatched = (dirName) => {
    const watcher = stubState.watchers.findLast(({ pattern }) => pattern.base.fsPath === join(outsideDir, dirName))

    return !watcher.disposed
  }

  resetStub([repoDir])

  const commands = [{ command: `rm ${names.join(' ')}`, cwd: outsideDir }]

  const promptId = await startTurn(repoDir, 'chat', [repoDir], { commands })

  const toolInput = { command: 'rm d1/a.md extra/a.md' }
  const payload = { session_id: 'chat', prompt_id: promptId, tool_name: 'Bash', tool_input: toolInput, cwd: outsideDir }

  assert.ok(!isWatched('d0'), 'one directory over the cap, so the first one named is released')
  assert.ok(isWatched('d1') && isWatched('d100'), 'the rest, and the newest above all, stay watched')

  await handleTurn('arm', project, payload, [repoDir])

  const namedAgain = 'd1 was next in line, but this command is about to write there, so it moves to the back'

  assert.ok(isWatched('d1'), namedAgain)
  assert.ok(!isWatched('d2'), 'and the next oldest makes room for the new directory instead')
  assert.ok(isWatched('extra'), 'a directory named now is always watched, however full the turn already is')

  await handleTurn('end', project, { session_id: 'chat' }, [repoDir])
})
