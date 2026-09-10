# Changelog

## 0.2.0

Mostly an internal rewrite. What changed for you is that the last-turn diff is
now kept per project — keyed by the directory the session started in, the way
Claude Code keys `~/.claude/projects` — so several VS Code windows no longer
overwrite each other's diff.

- The hook is now a 36-line client that hands the payload to the extension over
  a loopback socket. All capture logic moved into the extension, so it is one
  language, unit-tested, and the hook runs on bash builtins alone instead of
  spawning `jq` and `git` before every tool call. `jq` is no longer required.
- Ending a turn no longer spawns a git process per changed file. It reads every
  before-image in one batch, so a turn touching fifty files costs the same as
  one touching two.
- A project's state is one flat directory: the manifest, one set of
  before-images, and whatever the running turn has captured. They are written
  together, so the diff can never point at images that have moved on, and
  nothing is left to age out. Two chats at once in one project now share a
  single diff rather than getting one each.
- Each window advertises the server it runs, under the project it has open, so
  the hook knows where to send a turn.
- A window with no folder open gets diffs too. Claude Code keys a chat started
  there under your home directory, so that is where such a window advertises
  itself and looks for the turn to show.
- A turn cut short by an API error now produces a diff too, via the
  `StopFailure` hook. Reloading is not enough to pick this up — the extension
  will offer to register the new hook.
- **Turn Diff: Show last turn changes** now shows the turn in progress when
  there is one, so you can look at what Claude has changed so far without
  waiting for it to finish. It brings the diff up to date each time you ask,
  leaves the turn running, and falls back to the last finished turn while a turn
  has changed nothing yet.
- A turn that ends without the extension hearing about it is no longer lost.
  Claude Code runs no `Stop` hook on a turn you interrupt, and a turn that ends
  cleanly reaches nothing if the window was closed or reloading at the time. In
  either case nothing opens by itself, but asking for the diff now finishes the
  turn off and publishes it like any other — as long as you ask before your next
  message, which discards its baseline.
- Files in the diff are ordered the way the explorer shows them: folders before
  files at each level, then by name, ignoring case and reading digits as
  numbers. Repositories come in workspace order with anything outside them
  last, and a moved file sits where it landed rather than where it came from.
- Fixed: a background command finishing, or a message you queued, while a turn
  was still running restarted its diff, so everything the turn had done before
  that point was missing from it. Claude Code raises `UserPromptSubmit` for
  anything it hands to a running turn, and it was taken for a new prompt.
- Fixed: an edit that left a file the same size went unreported if it landed in
  the same second as the last commit. Snapshots copy `.git/index`, and the
  copy's fresh timestamp is what stopped git re-reading a file it had cached.
- Fixed: a file outside the workspace kept showing its pre-turn contents on
  both sides of the diff until the window was refocused. VS Code only watches
  what is inside the workspace, so its copy of such a file lagged behind disk;
  those paths are now watched for as long as the turn that touches them.
- Fixed: reopening VS Code showed the last turn's diff with every left side
  empty. The editor is restored across a restart, but the before-images behind
  it were only remembered by the render that opened it. They are now resolved
  from the manifest on disk, and served over a scheme the editor waits for, so
  a diff restored as the active tab no longer races the extension loading.
- Fixed: a binary file outside every repository was counted in the diff title
  and then rendered as nothing. Binaries are now detected by their contents
  wherever they were captured, not just inside a repository.
- Fixed: a moved file was reported as an addition, and the path it moved from
  never appeared at all, so a file moved and edited in one turn looked brand
  new. Moves now show as renames, old path to new, with the edit in the diff.
- Fixed: creating an empty file was never reported. An absent before-image was
  written out as an empty file and then compared against the new one, so the two
  matched byte for byte and the addition was dropped. Deleting an empty file was
  always reported, and still is.
- Fixed: editing a file yourself after a turn could make its diff entry lie. One
  the turn had changed, deleted by hand, still offered a right-hand side that no
  longer existed; one the turn had deleted, recreated by hand, still showed as a
  deletion. Whether a file counts as added, changed or deleted is now worked out
  when the diff opens rather than fixed when the turn ends.
- Removed `refs/claude/turns`. It only ever recorded the repository containing
  the folder Claude Code was started in, so in a multi-root workspace it stayed
  silently out of date as soon as you edited anything in one of the other
  folders. Nothing read it, and the diff never depended on it.

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
