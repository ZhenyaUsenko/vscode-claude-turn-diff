// Deciding whether the hooks in ~/.claude/settings.json are the ones we ship.

const { assert, check } = require('./support')
const { hooksRegistered } = require('../src/install')
const { HOOK_SPEC } = require('../src/config')

const registered = () => JSON.parse(JSON.stringify({ hooks: HOOK_SPEC }))

check('a settings file holding exactly our spec counts as registered', () => {
  assert.strictEqual(hooksRegistered(registered()), true)
})

check('an empty settings file does not', () => {
  assert.strictEqual(hooksRegistered({}), false)
})

check('a missing event does not', () => {
  const settings = registered()
  delete settings.hooks.StopFailure
  assert.strictEqual(hooksRegistered(settings), false)
})

check('an entry that no longer matches the spec does not', () => {
  const settings = registered()
  settings.hooks.PreToolUse[0].matcher = 'Edit'
  assert.strictEqual(hooksRegistered(settings), false, 'a changed matcher must re-prompt')

  const stale = registered()
  stale.hooks.Stop[0].hooks[0].timeout = 5
  assert.strictEqual(hooksRegistered(stale), false, 'a changed timeout must re-prompt')

  const renamed = registered()
  renamed.hooks.UserPromptSubmit[0].hooks[0].command = '"$HOME"/.claude/hooks/turn-diff.sh start'
  assert.strictEqual(hooksRegistered(renamed), false, 'a changed command must re-prompt')
})

check("someone else's hooks on the same events are ignored", () => {
  const settings = registered()
  settings.hooks.Stop.unshift({ hooks: [{ type: 'command', command: 'say done' }] })
  settings.hooks.Lint = [{ hooks: [{ type: 'command', command: 'eslint' }] }]
  assert.strictEqual(hooksRegistered(settings), true)
})
