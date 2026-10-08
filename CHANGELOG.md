# Changelog

## 0.2.1

- The diff of a finished turn now opens as a regular tab, where it used to be a preview. The next turn's diff, or a file you click once in the explorer, no longer takes its place, so it stays until you close it. A look at a turn still running remains a preview, and the finished diff replaces it.

- A turn whose main agent stops while subagents or workflows it started in the background are still working now waits for them. No diff opens until the main agent stops with nothing left running, so the agents' edits and what the main agent does with their reports land in one diff. A prompt you send in the meantime joins the same turn. Edits an agent made after the main agent had stopped used to appear in no diff at all.

- A turn cut short by an API error now opens as "Changes so far" and stays open. Whatever you continue with after the error lands in the same diff, which opens as usual once the turn finishes.

- A turn whose end never reached the extension, because the window was closed or reloading just as it finished, is no longer finished off when you ask for its diff. It shows as changes so far, and your next prompt in that chat carries it on. The extension cannot tell such a turn from one still waiting for its agents, so asking for the diff now finishes a turn off only when you interrupted it.

- Fixed: closing the window while Claude was working left everything the turn had done so far out of its diff. Claude Code picks such a turn back up when the window reopens, and the prompt it resumes with was taken for a new turn.

- Fixed: a file outside the workspace could still show its old contents on both sides of the diff. The watcher that makes VS Code reload such a file takes a moment to start, and an edit landing in that moment went unreported. The file is now nudged a second later, once its watcher is live.

- Fixed: a background subagent failing on an API error, such as a usage limit, ended the diff of the turn it was running in. The diff opened while the turn was still going, and whatever the turn did afterwards landed in a separate, later diff. Several subagents failing together opened a diff each. Claude Code reports a failed subagent through the same `StopFailure` hook as the main agent, and the two are now told apart.

- Fixed: a turn whose only change was a file outside every repository that Claude tried to create but never did, because you refused the write or it failed, replaced the previous turn's diff with an empty one. Nothing opened, but the last diff was gone, and a look at a running turn showed nothing instead of the last finished turn.

- Fixed: when the files a turn changed in one repository came to more than 64 MB before the turn, every change in that repository was left out of the diff. Now only a file over 50 MB is left out, the same way a binary is, since VS Code computes no diff above that size anyway. The rest are listed as usual.

- Fixed: an untracked file with `*`, `?` or `[` in its name was read by git as a pattern, so it could pull in other files it matched, including gitignored ones, which then appeared in the diff whenever they changed.

- Fixed: removing the hooks, or registering them again after an update, also deleted any other command that had been added to the same hook group as ours. Only our own entries are touched now.

- Untracked files are no longer left out for being over 1 MB. A text file that size now appears like any other, with what it held before. Binaries are left out of the snapshots instead, since they cannot be shown and hashing them twice a turn was the cost the limit was there to spare. This also stops an untracked file that shrank below 1 MB during a turn from showing up as newly created.

- Fixed: a git repository nested inside the workspace repository, not ignored and with no commit in it yet, made git refuse to stage any untracked file alongside it. Files created during a turn were missing from the diff until the nested repository got its first commit or a `.gitignore` entry.

## 0.2.0

The capture logic moved out of the bash hook and into the extension, and each project now keeps its own diff, so several VS Code windows no longer overwrite each other's. You can look at a turn while it is still running. A turn that was interrupted, or that ended while the window was closed, can still be shown afterwards, and one cut short by an API error gets a diff too. Moved files show as renames, files are listed in the explorer's order, and several cases where the diff came out empty, stale or incomplete are fixed.

Needs Claude Code 2.1.196 or newer and git 2.38 or newer. After updating, accept the prompt to register the new `StopFailure` hook.

- **Turn Diff: Show last turn changes** now shows the turn in progress when there is one, so you can look at what Claude has changed so far without waiting for it to finish. It brings the diff up to date each time you ask, leaves the turn running, and falls back to the last finished turn while a turn has changed nothing yet.

- A turn that ends without the extension hearing about it is no longer lost. Claude Code runs no `Stop` hook on a turn you interrupt, and a turn that ends cleanly reaches nothing if the window was closed or reloading at the time. In either case nothing opens by itself, but asking for the diff now finishes the turn off and publishes it like any other, as long as you ask before your next message, which discards its baseline.

- A turn cut short by an API error now produces a diff too, via the `StopFailure` hook. Reloading is not enough to pick this up; the extension will offer to register the new hook.

- The last-turn diff is now kept per project, keyed by the directory the session started in, the same way Claude Code keys `~/.claude/projects`. Several VS Code windows no longer overwrite each other's diff.

- A window with no folder open gets diffs too. Claude Code keys a chat started there under your home directory, so that is where such a window advertises itself and looks for the turn to show.

- Files in the diff are ordered the way the explorer shows them: folders before files at each level, then by name, ignoring case and reading digits as numbers. Repositories come in workspace order with anything outside them last, and a moved file sits where it landed rather than where it came from.

- The hook is now a 36-line client. It hands the payload to the extension over a loopback socket, and all capture logic lives in the extension: one language, unit-tested. The hook runs on bash builtins alone, so it no longer spawns `jq` and `git` before every tool call, and `jq` is no longer required.

- Ending a turn no longer spawns a git process per changed file. It reads every before-image in one batch, so a turn touching fifty files costs the same as one touching two.

- A project's state is one flat directory: the manifest, one set of before-images, and whatever the running turn has captured so far. The manifest and the images are written together, so the diff can never point at images that have moved on, and nothing is left behind to age out. Two chats running at once in one project now share a single diff rather than getting one each.

- Each window advertises the server it runs, under the project it has open, so the hook knows where to send a turn.

- Fixed: a background command finishing, or a message you queued, while a turn was still running restarted its diff, so everything the turn had done before that point was missing from it. Claude Code raises `UserPromptSubmit` for anything it hands to a running turn, and it was taken for a new prompt.

- Fixed: reopening VS Code showed the last turn's diff with every left side empty. The editor is restored across a restart, but the before-images behind it were only remembered by the render that opened it. They are now resolved from the manifest on disk, and served over a scheme the editor waits for, so a diff restored as the active tab no longer races the extension loading.

- Fixed: a moved file was reported as an addition, and the path it moved from never appeared at all, so a file moved and edited in one turn looked brand new. Moves now show as renames, old path to new, with the edit in the diff.

- Fixed: a file outside the workspace kept showing its pre-turn contents on both sides of the diff until the window was refocused. VS Code only watches what is inside the workspace, so its copy of such a file lagged behind disk; those paths are now watched for as long as the turn that touches them.

- Fixed: editing a file yourself after a turn could make its diff entry wrong. A file the turn had changed and you then deleted still offered a right-hand side that no longer existed, and a file the turn had deleted and you then recreated still showed as a deletion. Whether a file counts as added, changed or deleted is now worked out when the diff opens, not fixed when the turn ends.

- Fixed: creating an empty file was never reported. An absent before-image was written out as an empty file and then compared against the new one, so the two matched byte for byte and the addition was dropped. Deleting an empty file was always reported, and still is.

- Fixed: a binary file outside every repository was counted in the diff title and then rendered as nothing. Binaries are now detected by their contents wherever they were captured, not just inside a repository.

- Fixed: an edit that left a file the same size went unreported if it landed in the same second as the last commit. Snapshots copy `.git/index`, and the copy's fresh timestamp is what stopped git re-reading a file it had cached.

- Removed `refs/claude/turns`. It only ever recorded the repository containing the folder Claude Code was started in, so in a multi-root workspace it stayed silently out of date as soon as you edited anything in one of the other folders. Nothing read it, and the diff never depended on it.

## 0.1.1

- Document that binary files are not shown. The multi-file diff editor resolves both sides through VS Code's text model service, so a binary entry cannot render and is skipped rather than counted and silently dropped.

## 0.1.0

First release.

- One multi-file diff editor per Claude Code turn, opened automatically when the turn ends.

- Snapshots every git repo in the workspace, so a turn spanning several repos produces a single diff.

- Per-file capture for paths outside every repo.

- `A` / `M` / `D` status badges, and no spurious rename badges.

- Entries that no longer represent a change are dropped, including on replay.

- Records the turn at `refs/claude/turns` in the repo containing the working directory.

- Commands to register and remove the Claude Code hooks.
