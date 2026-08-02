# Changelog

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
