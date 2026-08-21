import { getChatDir, getManifestFile, getServerFile, getProjectKey } from '../../src/utils/paths.js'
import { check } from '../utils/checks.js'
import { commitAll, createRepo, write } from '../utils/fixtures.js'
import { forgetChat, nextSecond, readManifest, runTurn } from '../utils/turn.js'
import assert from 'assert'
import fs from 'fs'
import path from 'path'

check('a later chat supersedes an earlier one in the same project', async () => {
  const repo = createRepo()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'first', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const supersededImage = readManifest(repo).files[0][1]

  await nextSecond()
  await runTurn(repo, 'second', [repo], () => write(path.join(repo, 'f.txt'), 'three\n'))

  assert.ok(!fs.existsSync(supersededImage), 'the first chat\'s before-image was reclaimed')
  assert.ok(fs.existsSync(readManifest(repo).files[0][1]), 'the winning manifest still resolves')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a chat deleted in Claude Code has its whole directory reclaimed', async () => {
  const repo = createRepo()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'ghost', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const ghostDir = getChatDir(getProjectKey(repo), 'ghost')
  const beforeImageDirs = fs.readdirSync(ghostDir).filter((name) => name.startsWith('before-'))

  assert.strictEqual(beforeImageDirs.length, 1, 'the finished turn left its before-images behind')

  forgetChat(repo, 'ghost')

  await nextSecond()
  await runTurn(repo, 'alive', [repo], () => write(path.join(repo, 'f.txt'), 'three\n'))

  assert.ok(!fs.existsSync(ghostDir), 'the deleted chat is gone, before-images included')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a finishing turn leaves the server advert alone', async () => {
  const repo = createRepo()
  const advertFile = getServerFile(getProjectKey(repo), process.pid)

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)
  write(advertFile, '{"port":1,"token":"t","pid":1}')

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  assert.ok(fs.existsSync(advertFile), 'the advert survived a turn that published a diff')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that changes nothing leaves the previous manifest alone', async () => {
  const repo = createRepo()
  const manifestFile = getManifestFile(getProjectKey(repo))

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const publishedManifest = fs.readFileSync(manifestFile, 'utf8')

  await nextSecond()
  await runTurn(repo, 'chat', [repo], () => {})

  assert.strictEqual(fs.readFileSync(manifestFile, 'utf8'), publishedManifest)
})
