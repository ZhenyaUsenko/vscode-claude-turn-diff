// Untracked files larger than this are left out of BOTH snapshots, so they
// cancel out and never appear in a diff. Tracked files are never size-filtered:
// git only re-hashes those whose stat info changed, whereas untracked ones are
// hashed from scratch on every single snapshot.
const MAX_UNTRACKED_BYTES = 1024 * 1024

// What gets written into ~/.claude/settings.json. `arm` matches every tool
// that can write, including Bash, because a shell command is exactly the case
// per-file capture cannot see coming. `end` is registered for StopFailure too:
// a turn cut short by an API error never reaches Stop, and its snapshot would
// sit unclaimed until the next prompt discarded it.
const HOOK_COMMAND = '"$HOME"/.claude/hooks/turn-diff.sh'

const HOOK_SPEC = {
  UserPromptSubmit: [
    { hooks: [{ type: 'command', command: `${HOOK_COMMAND} begin`, timeout: 10 }] },
  ],
  PreToolUse: [
    {
      matcher: 'Edit|Write|MultiEdit|NotebookEdit|Bash',
      hooks: [{ type: 'command', command: `${HOOK_COMMAND} arm`, timeout: 15 }],
    },
  ],
  Stop: [{ hooks: [{ type: 'command', command: `${HOOK_COMMAND} end`, timeout: 30 }] }],
  StopFailure: [{ hooks: [{ type: 'command', command: `${HOOK_COMMAND} end`, timeout: 30 }] }],
}

// Recognises our own entries in a settings file we do not otherwise own.
const HOOK_MARKER = 'turn-diff.sh'

// globalState key remembering that the user declined the install prompt.
const DECLINED_KEY = 'claudeTurnDiff.declinedHookInstall'

module.exports = { MAX_UNTRACKED_BYTES, HOOK_SPEC, HOOK_MARKER, DECLINED_KEY }
