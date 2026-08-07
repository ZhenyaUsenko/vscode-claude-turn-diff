# Changelog

## 0.2.0

Mostly an internal rewrite. What changed for you is that the last-turn diff is
now kept per project — keyed by the directory the session started in, the way
Claude Code keys `~/.claude/projects` — so several VS Code windows no longer
overwrite each other's diff.

- The hook is now a 44-line client that hands the payload to the extension over
  a loopback socket. All capture logic moved into the extension, so it is one
  language, unit-tested, and the hook runs on bash builtins alone instead of
  spawning `jq` and `git` before every tool call. `jq` is no longer required.
- A project's manifest now lives beside the before-images it points at, so the
  two can never be pruned apart.
- Each window advertises its own server, so two windows on one project cannot
  delete each other's advertisement.
- A turn cut short by an API error now produces a diff too, via the
  `StopFailure` hook. Reloading is not enough to pick this up — the extension
  will offer to register the new hook.
- Fixed: an edit that left a file the same size went unreported if it landed in
  the same second as the last commit. Snapshots copy `.git/index`, and the
  copy's fresh timestamp is what stopped git re-reading a file it had cached.
- Fixed: a file outside the workspace kept showing its pre-turn contents on
  both sides of the diff until the window was refocused. VS Code only watches
  what is inside the workspace, so its copy of such a file lagged behind disk;
  those paths are now watched for as long as the turn that touches them.
- Removed `refs/claude/turns`. It only ever recorded the repository containing
  the folder Claude Code was started in, so in a multi-root workspace it stayed
  silently out of date as soon as you edited anything in one of the other
  folders. Nothing read it, and the diff never depended on it.
- State is reclaimed when a turn supersedes it, and a chat deleted in Claude
  Code has its state removed. No time-based sweep.

## 0.1.1

- Document that binary files are not shown. The multi-file diff editor resolves
  both sides through VS Code's text model service, so a binary entry cannot
  render and is skipped rather than counted and silently dropped.

## 0.1.0

First release.

- One multi-file diff editor per Claude Code turn, opened automatically when
  the turn ends.
- Snapshots every git repo in the workspace, so a turn spanning several repos
  produces a single diff.
- Per-file capture for paths outside every repo.
- `A` / `M` / `D` status badges, and no spurious rename badges.
- Entries that no longer represent a change are dropped, including on replay.
- Records the turn at `refs/claude/turns` in the repo containing the working
  directory.
- Commands to register and remove the Claude Code hooks.
