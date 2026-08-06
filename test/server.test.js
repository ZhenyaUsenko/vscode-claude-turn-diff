// Advertising: the file the hook looks for before it will do any work.

const os = require('os')
const { execFile } = require('child_process')
const { assert, fs, path, paths, HOME, check, repoAt, projectKey } = require('./support')
const { start } = require('../src/server')

const settle = () => new Promise((resolve) => setTimeout(resolve, 60))

const HOOK = path.join(__dirname, '..', 'hooks', 'turn-diff.sh')

// Runs the real hook script the way Claude Code does. It must not block the
// event loop: the server answering it lives in this process.
const runHook = (mode, payload, cwd) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      HOOK,
      [mode],
      { cwd, env: { ...process.env, HOME } },
      (error) => (error ? reject(error) : resolve()),
    )
    child.stdin.end(JSON.stringify(payload))
  })

const advertOf = (directory) => {
  const file = paths.serverFileFor(projectKey(directory), process.pid)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
}

check('re-advertising an unchanged workspace leaves the advert in place', async () => {
  const repo = repoAt()
  const server = start(() => [repo], () => {})
  await settle()

  const first = advertOf(repo)
  assert.ok(first, 'the window advertises once it is listening')

  server.readvertise()
  assert.strictEqual(advertOf(repo), first, 'a no-op re-advertise must not disturb it')

  server.dispose()
})

check('a window with no folders advertises nothing', async () => {
  let folders = []
  const repo = repoAt()
  const server = start(() => folders, () => {})
  await settle()

  assert.strictEqual(advertOf(repo), null, 'nothing to serve, nothing advertised')

  folders = [repo]
  server.readvertise()
  assert.ok(advertOf(repo), 'it advertises once a folder arrives')

  folders = []
  server.readvertise()
  assert.strictEqual(advertOf(repo), null, 'and withdraws when the last one goes')

  server.dispose()
})

check('an advert deleted underneath the window is written again', async () => {
  const repo = repoAt()
  const server = start(() => [repo], () => {})
  await settle()

  const file = paths.serverFileFor(projectKey(repo), process.pid)
  fs.unlinkSync(file)

  server.readvertise()
  assert.ok(fs.existsSync(file), 'the window notices its advert is gone')

  server.dispose()
})

check('disposing removes the advert', async () => {
  const repo = repoAt()
  const server = start(() => [repo], () => {})
  await settle()
  assert.ok(advertOf(repo))

  server.dispose()
  assert.strictEqual(advertOf(repo), null)
})

check('the hook keys state by the session, not by a cwd Claude has moved', async () => {
  const repo = repoAt()
  const project = projectKey(repo)
  const server = start(() => [repo], () => {})
  await settle()

  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'wandered-'))
  await runHook(
    'begin',
    {
      session_id: 'drifted',
      transcript_path: path.join(HOME, '.claude', 'projects', project, 'drifted.jsonl'),
    },
    elsewhere,
  )

  assert.ok(
    fs.existsSync(paths.chatDirFor(project, 'drifted')),
    'the turn belongs to the project the session started in',
  )
  assert.ok(
    !fs.existsSync(paths.chatDirFor(projectKey(elsewhere), 'drifted')),
    'and never to the directory Claude happened to cd into',
  )

  server.dispose()
})
