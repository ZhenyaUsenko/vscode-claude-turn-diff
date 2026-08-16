import { chatDirFor, manifestFor, serverFileFor, projectKey } from '../src/util/paths.js'
import { check, createRepo, commitAll, write, runTurn, manifest, nextSecond, forgetChat } from './support.js'
import assert from 'assert'
import fs from 'fs'
import path from 'path'

check('a later chat supersedes an earlier one in the same project', async () => {
  const repo = createRepo()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'first', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const supersededImage = manifest(repo).files[0][1]

  await nextSecond()
  await runTurn(repo, 'second', [repo], () => write(path.join(repo, 'f.txt'), 'three\n'))

  assert.ok(!fs.existsSync(supersededImage), 'the first chat\'s before-image was reclaimed')
  assert.ok(fs.existsSync(manifest(repo).files[0][1]), 'the winning manifest still resolves')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a chat deleted in Claude Code has its whole directory reclaimed', async () => {
  const repo = createRepo()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'ghost', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const ghostDir = chatDirFor(projectKey(repo), 'ghost')
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
  const advertFile = serverFileFor(projectKey(repo), process.pid)

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)
  write(advertFile, '{"port":1,"token":"t","pid":1}')

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  assert.ok(fs.existsSync(advertFile), 'the advert survived a turn that published a diff')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that changes nothing leaves the previous manifest alone', async () => {
  const repo = createRepo()
  const manifestFile = manifestFor(projectKey(repo))

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const publishedManifest = fs.readFileSync(manifestFile, 'utf8')

  await nextSecond()
  await runTurn(repo, 'chat', [repo], () => {})

  assert.strictEqual(fs.readFileSync(manifestFile, 'utf8'), publishedManifest)
})
