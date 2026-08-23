import { readManifest } from '../../src/store/manifest.js'
import { getChatDir, getManifestFile, getServerFile, getProjectKey } from '../../src/store/paths.js'
import { listDirNames, outputFile, readFile } from '../../src/utils/files.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo } from '../utils/fixtures.js'
import { forgetChat, nextSecond, runTurn } from '../utils/turn.js'
import assert from 'assert'
import { existsSync } from 'fs'
import { join } from 'path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a later chat supersedes an earlier one in the same project', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'first', [repo], () => outputFile(join(repo, 'f.txt'), 'two\n'))

  const supersededImage = readManifest(getProjectKey(repo)).files[0].beforeImage

  await nextSecond()
  await runTurn(repo, 'second', [repo], () => outputFile(join(repo, 'f.txt'), 'three\n'))

  assert.ok(!existsSync(supersededImage), 'the first chat\'s before-image was reclaimed')
  assert.ok(existsSync(readManifest(getProjectKey(repo)).files[0].beforeImage), 'the winning manifest still resolves')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a chat deleted in Claude Code has its whole directory reclaimed', async () => {
  const repo = createRepo()

  outputFile(join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'ghost', [repo], () => outputFile(join(repo, 'f.txt'), 'two\n'))

  const ghostDir = getChatDir(getProjectKey(repo), 'ghost')
  const beforeImageDirs = listDirNames(ghostDir).filter((name) => name.startsWith('before-'))

  assert.strictEqual(beforeImageDirs.length, 1, 'the finished turn left its before-images behind')

  forgetChat(repo, 'ghost')

  await nextSecond()
  await runTurn(repo, 'alive', [repo], () => outputFile(join(repo, 'f.txt'), 'three\n'))

  assert.ok(!existsSync(ghostDir), 'the deleted chat is gone, before-images included')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a finishing turn leaves the server advert alone', async () => {
  const repo = createRepo()
  const advertFile = getServerFile(getProjectKey(repo), process.pid)

  outputFile(join(repo, 'f.txt'), 'one\n')
  commitAll(repo)
  outputFile(advertFile, '{"port":1,"token":"t","pid":1}')

  await runTurn(repo, 'chat', [repo], () => outputFile(join(repo, 'f.txt'), 'two\n'))

  assert.ok(existsSync(advertFile), 'the advert survived a turn that published a diff')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that changes nothing leaves the previous manifest alone', async () => {
  const repo = createRepo()
  const manifestFile = getManifestFile(getProjectKey(repo))

  outputFile(join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => outputFile(join(repo, 'f.txt'), 'two\n'))

  const publishedManifest = readFile(manifestFile, 'utf8')

  await nextSecond()
  await runTurn(repo, 'chat', [repo], () => {})

  assert.strictEqual(readFile(manifestFile, 'utf8'), publishedManifest)
})
