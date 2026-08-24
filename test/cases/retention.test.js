import { readManifest } from '../../src/store/manifest.js'
import { getChatDir, getManifestFile, getServerFile, getProjectKey } from '../../src/store/paths.js'
import { listDirNames, outputFile, readFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { forgetChat, nextSecond, runTurn } from '../utils/turn.js'
import assert from 'node:assert'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a later chat supersedes an earlier one in the same project', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'first', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  const supersededImageFile = readManifest(getProjectKey(repoDir)).changes[0].beforeImageFile

  await nextSecond()
  await runTurn(repoDir, 'second', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'three\n'))

  const winningImageFile = readManifest(getProjectKey(repoDir)).changes[0].beforeImageFile

  assert.ok(!existsSync(supersededImageFile), 'the first chat\'s before-image was reclaimed')
  assert.ok(existsSync(winningImageFile), 'the winning manifest still resolves')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a chat deleted in Claude Code has its whole directory reclaimed', async () => {
  const repoDir = createRepo()

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'ghost', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  const ghostDir = getChatDir(getProjectKey(repoDir), 'ghost')
  const beforeDirNames = listDirNames(ghostDir).filter((name) => name.startsWith('before-'))

  assert.strictEqual(beforeDirNames.length, 1, 'the finished turn left its before-images behind')

  forgetChat(repoDir, 'ghost')

  await nextSecond()
  await runTurn(repoDir, 'alive', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'three\n'))

  assert.ok(!existsSync(ghostDir), 'the deleted chat is gone, before-images included')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a finishing turn leaves the server advert alone', async () => {
  const repoDir = createRepo()
  const advertFile = getServerFile(getProjectKey(repoDir), process.pid)

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)
  outputFile(advertFile, '{"port":1,"token":"t","pid":1}')

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  assert.ok(existsSync(advertFile), 'the advert survived a turn that published a diff')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that changes nothing leaves the previous manifest alone', async () => {
  const repoDir = createRepo()
  const manifestFile = getManifestFile(getProjectKey(repoDir))

  outputFile(join(repoDir, 'f.txt'), 'one\n')
  commitAll(repoDir)

  await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

  const publishedManifestContents = readFile(manifestFile, 'utf8')

  await nextSecond()
  await runTurn(repoDir, 'chat', [repoDir], () => {})

  assert.strictEqual(readFile(manifestFile, 'utf8'), publishedManifestContents)
})
