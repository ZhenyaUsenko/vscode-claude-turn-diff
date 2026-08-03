// refs/claude/turns: a detached ref holding exactly the latest turn.

const { execFileSync } = require('child_process')
const { assert, path, check, repoAt, commitAll, write, runTurn } = require('./support')

const show = (repo, ...args) =>
  execFileSync('git', ['-C', repo, 'show', ...args, 'refs/claude/turns'], { encoding: 'utf8' })

check('the shadow ref holds exactly this turn, titled with the prompt', async () => {
  const repo = repoAt()
  write(path.join(repo, 'f.txt'), 'one\n')
  write(path.join(repo, 'untouched.txt'), 'stays\n')
  commitAll(repo)

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'), {
    prompt: 'my prompt',
  })

  const summary = show(repo, '--stat', '--format=%s')
  assert.ok(summary.includes('my prompt'), 'the prompt became the commit subject')
  assert.ok(summary.includes('f.txt'), 'the changed file is in the commit')
  assert.ok(!summary.includes('untouched.txt'), 'unchanged files are not')
})

check('a working tree already dirty at turn start is recorded separately', async () => {
  const repo = repoAt()
  write(path.join(repo, 'f.txt'), 'one\n')
  commitAll(repo)
  write(path.join(repo, 'drift.txt'), 'edited outside Claude\n') // uncommitted before the turn

  await runTurn(repo, 'chat', [repo], () => write(path.join(repo, 'f.txt'), 'two\n'))

  const turnCommit = show(repo, '--stat', '--format=%s')
  assert.ok(turnCommit.includes('f.txt'))
  assert.ok(
    !turnCommit.includes('drift.txt'),
    'pre-existing drift belongs to the baseline commit, not to the turn',
  )

  const parent = execFileSync(
    'git',
    ['-C', repo, 'show', '--stat', '--format=%s', 'refs/claude/turns^'],
    { encoding: 'utf8' },
  )
  assert.ok(parent.includes('uncommitted state before this turn'))
  assert.ok(parent.includes('drift.txt'))
})
