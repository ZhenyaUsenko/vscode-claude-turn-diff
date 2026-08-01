# Turn Diff for Claude Code

Shows everything Claude Code changed during one turn as a **single multi-file
diff editor**, opened automatically when the turn ends.

Claude Code's CLI writes files straight to disk, so its edits never pass
through VSCode's file service. They leave no Local History entry, no Timeline
entry, and no way to review a turn as a unit — you get a diff per message in
the chat panel instead. This closes that gap.

> Unofficial community extension. Not affiliated with or endorsed by Anthropic.

## What you get

- **One tab per turn**, not one per file. Every changed file in a single
  scrollable multi-file diff, with per-file collapse.
- **Editable in place.** The right-hand side is the real file, so the *Revert
  block* arrows work — reviewing and undoing happen in the same view.
- **Every repo in the workspace.** A turn touching two repos in a multi-root
  workspace produces one diff listing both.
- **Files outside any repo too.** Edits to something in `~/.claude` or a
  scratch directory still show up.
- **Script-driven edits are caught.** An `rm`, `sed`, formatter run or
  `package-lock.json` churn from a shell command appears just like a direct
  edit — anything landing in a git worktree is seen, however it got there.
- **`A` / `M` / `D` badges**, with no spurious rename markers.

## Requirements

- [Claude Code](https://claude.com/claude-code)
- `jq` on your `PATH`
- macOS or Linux. On Windows, use WSL or Git Bash.

## Install

Install the extension, then accept the prompt to register three hooks in
`~/.claude/settings.json`. A backup is written to
`settings.json.turn-diff-backup` first.

The extension also installs the hook script it ships with to
`~/.claude/hooks/turn-diff.sh`, and keeps it in step on upgrade.

Claude Code reads hooks at session start, so **reload the window** afterwards.

Prefer to do it by hand? Run **Turn Diff: Register hooks in Claude settings**
from the palette, or add this yourself:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "\"$HOME\"/.claude/hooks/turn-diff.sh begin", "timeout": 10 }] }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash",
        "hooks": [{ "type": "command", "command": "\"$HOME\"/.claude/hooks/turn-diff.sh arm", "timeout": 15 }]
      }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "\"$HOME\"/.claude/hooks/turn-diff.sh end", "timeout": 30 }] }
    ]
  }
}
```

## Commands

| Command | Does |
|---|---|
| Turn Diff: Show last turn's changes | Reopens the last diff, skipping anything since reverted |
| Turn Diff: Register hooks in Claude settings | Writes the hook config, after a backup |
| Turn Diff: Remove hooks from Claude settings | Removes only this extension's entries |

## How it works

| Hook | Runs | Does |
|---|---|---|
| `UserPromptSubmit` | you hit enter | records the prompt. No git. |
| `PreToolUse` | first write-capable tool of the turn | snapshots every git repo in the workspace to dangling tree objects |
| `PreToolUse` | every `Edit`/`Write` naming a path | if that path is outside all those repos, copies its before-image |
| `Stop` | Claude finishes | diffs, opens the editor, points `refs/claude/turns` at this turn |

Snapshots use a throwaway copy of `.git/index`, so your real index and staging
area are never touched. Later `PreToolUse` calls hit a guard that runs on bash
builtins and exits in a few milliseconds. A turn that writes nothing never
spawns git at all.

Two mechanisms, because neither suffices alone: **tree snapshots** catch
anything happening inside a git worktree however it happened, but cannot see
outside a repo; **per-file capture** catches paths outside every repo, but only
when a tool names them.

## Storage

Before-images live in `~/.claude/turn-diff/`, and only the most recent turn is
kept — each turn purges the last. The diff compares against the *current* file,
which is what makes it editable, so an older turn stops being meaningful the
moment the tree moves on.

`refs/claude/turns` is a detached ref in the repo containing the working
directory. It never touches your branches and is never pushed. It holds the
latest turn only, rebuilt from `HEAD` each time:

```bash
git show refs/claude/turns              # exactly what Claude changed last turn
git update-ref -d refs/claude/turns     # remove it
```

## Limitations

- **Untracked** files over 1MB are excluded from snapshots — from both sides,
  so they cancel out and never appear.
- Gitignored files do not appear unless an `Edit`/`Write` tool named them
  directly. Already-tracked files always appear, ignore rules notwithstanding.
- A shell command writing **outside** every repo is caught by neither
  mechanism.
- Paths containing tabs or newlines are not handled.

## License

MIT
