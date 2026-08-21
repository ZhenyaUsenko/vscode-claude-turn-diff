export const HOOK_MARKER = 'turn-diff.sh'

export const DECLINED_KEY = 'claudeTurnDiff.declinedHookInstall'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const HOOK_COMMAND = '"$HOME"/.claude/hooks/turn-diff.sh'

const ARM_MATCHER = 'Edit|Write|MultiEdit|NotebookEdit|Bash'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const beginHook = [{ hooks: [{ type: 'command', command: `${HOOK_COMMAND} begin`, timeout: 10 }] }]

const armHook = [{ hooks: [{ type: 'command', command: `${HOOK_COMMAND} arm`, timeout: 15 }], matcher: ARM_MATCHER }]

const endHook = [{ hooks: [{ type: 'command', command: `${HOOK_COMMAND} end`, timeout: 30 }] }]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const HOOK_SPEC = { UserPromptSubmit: beginHook, PreToolUse: armHook, Stop: endHook, StopFailure: endHook }
