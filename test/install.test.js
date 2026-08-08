const { assert, check } = require('./support')
const { hooksRegistered } = require('../src/settings')
const { HOOK_SPEC } = require('../src/config')

const registered = () => JSON.parse(JSON.stringify({ hooks: HOOK_SPEC }))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a settings file holding exactly our spec counts as registered', () => {
  assert.strictEqual(hooksRegistered(registered()), true)
})

check('an empty settings file does not', () => {
  assert.strictEqual(hooksRegistered({}), false)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a missing event does not', () => {
  const settings = registered()

  delete settings.hooks.StopFailure

  assert.strictEqual(hooksRegistered(settings), false)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an entry that no longer matches the spec does not', () => {
  const changedMatcher = registered()
  const changedTimeout = registered()
  const changedCommand = registered()

  changedMatcher.hooks.PreToolUse[0].matcher = 'Edit'
  changedTimeout.hooks.Stop[0].hooks[0].timeout = 5
  changedCommand.hooks.UserPromptSubmit[0].hooks[0].command = '"$HOME"/.claude/hooks/turn-diff.sh start'

  assert.strictEqual(hooksRegistered(changedMatcher), false, 'a changed matcher must re-prompt')
  assert.strictEqual(hooksRegistered(changedTimeout), false, 'a changed timeout must re-prompt')
  assert.strictEqual(hooksRegistered(changedCommand), false, 'a changed command must re-prompt')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check("someone else's hooks on the same events are ignored", () => {
  const settings = registered()

  settings.hooks.Stop.unshift({ hooks: [{ type: 'command', command: 'say done' }] })
  settings.hooks.Lint = [{ hooks: [{ type: 'command', command: 'eslint' }] }]

  assert.strictEqual(hooksRegistered(settings), true)
})
