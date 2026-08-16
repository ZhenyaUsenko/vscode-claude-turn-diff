const { HOOK_SPEC } = require('../src/config')
const settings = require('../src/settings')
const { check } = require('./support')
const assert = require('assert')

const registeredSettings = () => JSON.parse(JSON.stringify({ hooks: HOOK_SPEC }))

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a settings file holding exactly our spec counts as registered', () => {
  assert.strictEqual(settings.hooksRegistered(registeredSettings()), true)
})

check('an empty settings file does not', () => {
  assert.strictEqual(settings.hooksRegistered({}), false)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a missing event does not', () => {
  const withoutStopFailure = registeredSettings()

  delete withoutStopFailure.hooks.StopFailure

  assert.strictEqual(settings.hooksRegistered(withoutStopFailure), false)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an entry that no longer matches the spec does not', () => {
  const changedMatcher = registeredSettings()
  const changedTimeout = registeredSettings()
  const changedCommand = registeredSettings()

  changedMatcher.hooks.PreToolUse[0].matcher = 'Edit'
  changedTimeout.hooks.Stop[0].hooks[0].timeout = 5
  changedCommand.hooks.UserPromptSubmit[0].hooks[0].command = '"$HOME"/.claude/hooks/turn-diff.sh start'

  assert.strictEqual(settings.hooksRegistered(changedMatcher), false, 'a changed matcher must re-prompt')
  assert.strictEqual(settings.hooksRegistered(changedTimeout), false, 'a changed timeout must re-prompt')
  assert.strictEqual(settings.hooksRegistered(changedCommand), false, 'a changed command must re-prompt')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('someone else\'s hooks on the same events are ignored', () => {
  const withForeignHooks = registeredSettings()

  withForeignHooks.hooks.Stop.unshift({ hooks: [{ type: 'command', command: 'say done' }] })
  withForeignHooks.hooks.Lint = [{ hooks: [{ type: 'command', command: 'eslint' }] }]

  assert.strictEqual(settings.hooksRegistered(withForeignHooks), true)
})
