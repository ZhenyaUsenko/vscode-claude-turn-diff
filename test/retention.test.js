const {
  assert, fs, path, paths, check, repoAt, commitAll, write, runTurn, manifest, nextSecond, forgetChat,
  projectKey,
} = require('./support')

check('a later chat supersedes an earlier one in the same project', async () => {
  const repo = repoAt()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'first', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const supersededImage = manifest(repo).files[0][1]

  await nextSecond()
  await runTurn(repo, 'second', [repo], () => write(path.join(repo, 'f.txt'), 'three\n'))

  assert.ok(!fs.existsSync(supersededImage), "the first chat's before-image was reclaimed")
  assert.ok(fs.existsSync(manifest(repo).files[0][1]), 'the winning manifest still resolves')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a chat deleted in Claude Code has its whole directory reclaimed', async () => {
  const repo = repoAt()

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'ghost', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const ghostDir = paths.chatDirFor(projectKey(repo), 'ghost')
  const images = fs.readdirSync(ghostDir).filter((name) => name.startsWith('before-'))

  assert.strictEqual(images.length, 1, 'the finished turn left its before-images behind')

  forgetChat(repo, 'ghost')

  await nextSecond()
  await runTurn(repo, 'alive', [repo], () => write(path.join(repo, 'f.txt'), 'three\n'))

  assert.ok(!fs.existsSync(ghostDir), 'the deleted chat is gone, before-images included')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a finishing turn leaves the server advert alone', async () => {
  const repo = repoAt()
  const advert = paths.serverFileFor(projectKey(repo), process.pid)

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)
  write(advert, '{"port":1,"token":"t","pid":1}')

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  assert.ok(fs.existsSync(advert), 'the advert survived a turn that published a diff')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a turn that changes nothing leaves the previous manifest alone', async () => {
  const repo = repoAt()
  const manifestFile = paths.manifestFor(projectKey(repo))

  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const published = fs.readFileSync(manifestFile, 'utf8')

  await nextSecond()
  await runTurn(repo, 'chat', [repo], () => {})

  assert.strictEqual(fs.readFileSync(manifestFile, 'utf8'), published)
})
