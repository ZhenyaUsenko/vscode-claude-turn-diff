import { applyHookSpec, hooksMatchSpec, stripOurHooks } from '../../src/install/settings.js'
import { HOOK_SPEC } from '../../src/install/spec.js'
import { check } from '../utils/checks.js'
import assert from 'node:assert'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getRegisteredSettings = () => {
  return JSON.parse(JSON.stringify({ hooks: HOOK_SPEC }))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a settings file holding exactly our spec counts as registered', () => {
  assert.strictEqual(hooksMatchSpec(getRegisteredSettings()), true)
})

check('an empty settings file does not', () => {
  assert.strictEqual(hooksMatchSpec({}), false)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('a missing event does not', () => {
  const withoutStopFailure = getRegisteredSettings()

  delete withoutStopFailure.hooks.StopFailure

  assert.strictEqual(hooksMatchSpec(withoutStopFailure), false)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('an entry that no longer matches the spec does not', () => {
  const changedMatcher = getRegisteredSettings()
  const changedTimeout = getRegisteredSettings()
  const changedCommand = getRegisteredSettings()

  changedMatcher.hooks.PreToolUse[0].matcher = 'Edit'
  changedTimeout.hooks.Stop[0].hooks[0].timeout = 5
  changedCommand.hooks.UserPromptSubmit[0].hooks[0].command = '"$HOME"/.claude/hooks/turn-diff.sh start'

  assert.strictEqual(hooksMatchSpec(changedMatcher), false, 'a changed matcher must re-prompt')
  assert.strictEqual(hooksMatchSpec(changedTimeout), false, 'a changed timeout must re-prompt')
  assert.strictEqual(hooksMatchSpec(changedCommand), false, 'a changed command must re-prompt')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('our hook under an event the spec no longer has does not', () => {
  const withDroppedEvent = getRegisteredSettings()

  withDroppedEvent.hooks.SessionStart = getRegisteredSettings().hooks.UserPromptSubmit

  const reason = 'a later version may stop registering an event, and only registering again removes what is left'

  assert.strictEqual(hooksMatchSpec(withDroppedEvent), false, reason)

  applyHookSpec(withDroppedEvent)

  assert.strictEqual(hooksMatchSpec(withDroppedEvent), true, 'registering again removes it')
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('someone else\'s hooks on the same events are ignored', () => {
  const withForeignHooks = getRegisteredSettings()

  withForeignHooks.hooks.Stop.unshift({ hooks: [{ type: 'command', command: 'say done' }] })
  withForeignHooks.hooks.Lint = [{ hooks: [{ type: 'command', command: 'eslint' }] }]

  assert.strictEqual(hooksMatchSpec(withForeignHooks), true)
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

check('removing or re-registering our hooks keeps someone else\'s hook in a shared group', () => {
  const removed = getRegisteredSettings()
  const reregistered = getRegisteredSettings()
  const foreignHook = { type: 'command', command: 'prettier --write' }

  removed.hooks.PreToolUse[0].hooks.push(foreignHook)
  reregistered.hooks.PreToolUse[0].hooks.push(foreignHook)
  reregistered.hooks.PreToolUse[0].hooks[0].timeout = 5

  stripOurHooks(removed)
  applyHookSpec(reregistered)

  const sharedGroup = { hooks: [foreignHook], matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash' }
  const writtenHooks = JSON.parse(JSON.stringify(removed.hooks))

  assert.deepStrictEqual(writtenHooks, { PreToolUse: [sharedGroup] }, 'only our entry leaves the group')
  assert.deepStrictEqual(reregistered.hooks.PreToolUse[0], sharedGroup, 'their entry stays where it was')
  assert.strictEqual(hooksMatchSpec(reregistered), true, 'and ours is registered afresh')
})
