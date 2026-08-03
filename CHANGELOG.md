# Changelog

## 0.2.0

Internal rewrite; behaviour is meant to be unchanged.

- The hook is now a 44-line client that hands the payload to the extension over
  a loopback socket. All capture logic moved into the extension, so it is one
  language, unit-tested, and no longer re-spawns an interpreter before every
  tool call. `jq` is no longer required.
- State is keyed by project the way Claude Code keys `~/.claude/projects`, and a
  project's manifest now lives beside the before-images it points at. Two
  windows on different projects no longer overwrite each other's diff.
- Each window advertises its own server, so two windows on one project cannot
  delete each other's advertisement.
- Fixed: a symlinked working directory (`/var` on macOS) meant the shadow ref
  was silently never written.
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
