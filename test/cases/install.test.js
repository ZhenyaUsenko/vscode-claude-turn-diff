import { hooksMatchSpec } from '../../src/install/settings.js'
import { HOOK_SPEC } from '../../src/install/spec.js'
import { check } from '../utils/checks.js'
import assert from 'assert'

const registeredSettings = () => {
  return JSON.parse(JSON.stringify({ hooks: HOOK_SPEC }))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a settings file holding exactly our spec counts as registered', () => {
  assert.strictEqual(hooksMatchSpec(registeredSettings()), true)
})

check('an empty settings file does not', () => {
  assert.strictEqual(hooksMatchSpec({}), false)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a missing event does not', () => {
  const withoutStopFailure = registeredSettings()

  delete withoutStopFailure.hooks.StopFailure

  assert.strictEqual(hooksMatchSpec(withoutStopFailure), false)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an entry that no longer matches the spec does not', () => {
  const changedMatcher = registeredSettings()
  const changedTimeout = registeredSettings()
  const changedCommand = registeredSettings()

  changedMatcher.hooks.PreToolUse[0].matcher = 'Edit'
  changedTimeout.hooks.Stop[0].hooks[0].timeout = 5
  changedCommand.hooks.UserPromptSubmit[0].hooks[0].command = '"$HOME"/.claude/hooks/turn-diff.sh start'

  assert.strictEqual(hooksMatchSpec(changedMatcher), false, 'a changed matcher must re-prompt')
  assert.strictEqual(hooksMatchSpec(changedTimeout), false, 'a changed timeout must re-prompt')
  assert.strictEqual(hooksMatchSpec(changedCommand), false, 'a changed command must re-prompt')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('someone else\'s hooks on the same events are ignored', () => {
  const withForeignHooks = registeredSettings()

  withForeignHooks.hooks.Stop.unshift({ hooks: [{ type: 'command', command: 'say done' }] })
  withForeignHooks.hooks.Lint = [{ hooks: [{ type: 'command', command: 'eslint' }] }]

  assert.strictEqual(hooksMatchSpec(withForeignHooks), true)
})
