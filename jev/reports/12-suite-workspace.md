# The suite method's workspace, tuned by watching Luna

The full-suite method now has its own setup, separate from the closed method. Instead of reading one prompt file, the agent gets a prepared workspace with the code and a working VS Code stub, and its instructions live in their own files. Three two-group pilots on GPT-6-Luna at high effort were watched live with `claude/watch.mjs`, and every friction seen was fixed in the setup before the next pilot. All runs were on clean code, so they say nothing about detection.

What they show:

- **Setup friction was most of the fix rounds.** Once it was removed, both groups reached their first suite run sooner and needed fewer requests.
- **Server got steadily faster**, from 3.6 to 3.0 to 2.2 minutes. Capture dropped from 6.0 to about 3 minutes.
- **Every friction came from the environment**, not from the tests: git, Codex's tools and the stub. None needed a change to how the tests or the code are described.

## The workspace

| Path | What it holds |
| --- | --- |
| `tests.md` | The background notes and the tests, with no source. |
| `code/` | The extension: `package.json`, `src/` and `hooks/`. |
| `node_modules/vscode/` | The stub from `suite/vscode/`, packaged as the `vscode` module, so every `vscode` import in the workspace loads it with no flags. |
| `scratch/` | An empty directory for the suite. |

- **The stub** implements everything the extension uses, with helpers to drive it (`resetStub`, `setWorkspaceFolders`, `fireWindowState`, `createContext`) and `stubState` to see what the extension did. The extension and the suite share one instance. It models a single VS Code window, and the instructions say so.
- **Instructions**: `text-tests-suite.md` for Claude Code, and `text-tests-suite-codex.md`, which also gives Codex the script that reads every file in one call. Neither mentions the repository or its test suite, and the runners add nothing to them.
- **Removed**: `run-codex.mjs --stub` and the reading note the runner used to add to the prompt. Each method's instructions now live in their own file.

## Pilots

| | First workspace | 6 fixes | + fresh directories, git tips, tests read last |
| --- | --- | --- | --- |
| Runs | r400, r401 | r402, r403 | r404, r405 |
| capture: time | 6.0 min | 2.9 min | 3.3 min |
| capture: requests / suite runs | 29 / 9 | 12 / 4 | 11 / 2 |
| capture: first suite run | 184 s | 120 s | 156 s |
| capture: output | 15.7k | 8.1k | 9.5k |
| server: time | 3.6 min | 3.0 min | 2.2 min |
| server: requests / suite runs | 15 / 6 | 14 / 3 | 10 / 5 |
| server: first suite run | 143 s | 112 s | 86 s |
| server: output | 10.2k | 7.5k | 6.2k |

For comparison, the guided runs in report 11, which read the old prompt file and wrote their own stub, took 4.0 minutes on capture and 4.5 on server.

All six runs passed every test on clean code, checked all their tests by running them, and broke no rules. The last four, run after a window reset, used about 1 point of the Codex five-hour window.

## What watching found

**First workspace:**

1. **Codex cut the combined read of `code/`**, about 11.2k tokens, dropping 1,240 from the middle, and both agents re-read the lost files. *Fix:* the Codex instructions give a one-call read script that raises both output limits.
2. **No git identity under a fresh `HOME`**, so fixture commits failed. *Fix:* the instructions say to set a user name and email in every test repository.
3. **`HOME` was reused across suite runs**, and capture's no-change tests saw manifests left by an earlier run. *Fix:* a new `HOME` for every run.
4. **The `--import` flag for the stub was forgotten once.** *Fix:* the stub became `node_modules/vscode`.
5. **Two activations in one process both received the focus event.** The extension reads `HOME` and keeps some state per process, so one process can't be two windows anyway. *Fix:* the instructions say the stub is a single window.
6. **A moved and edited fixture fell under git's rename threshold.** *Fix:* the background notes now say that git pairs a deletion and an addition as a rename only when their contents are at least 50% the same.

**After those 6 fixes:**

- The one-call read came back whole in both runs: all 20 files, about 59k characters.
- **Codex refused `rm -rf`** ("rm -f style commands are not permitted"). Capture tried it to clear an old `HOME` and make it fresh.
- **Fixture repositories with fixed names were reused across runs** in both agents. Leftover files broke one run, and baseline commits failed with nothing to commit.
- **Empty baseline commits failed.** `git commit` exits 1 when there is nothing to commit, and says so on stdout, so the agents' error messages were blank.
- **Capture re-read the end of `tests.md`** right after the combined read, which put the tests first and about 45 KB of code after them.

*Fixes:* make a new `HOME` and new test repositories for every run with `mktemp -d` or `fs.mkdtempSync`, instead of reusing or clearing old ones; pass `--allow-empty` to a commit that may be empty; read `tests.md` last, as the closed prompt puts the tests last.

**After those:** none of the setup problems came back. Neither agent re-read anything before writing. Capture's first suite run passed everything. Server's fix rounds were all test design in its two hook tests: its hook helper could not pipe stdin, one test activated the wrong project, and one expected state before arming a turn.

## Caveats

- **One run per group per setup.** The same group has taken twice as long between identical runs before, so requests and suite runs are steadier signals than time.
- **The rename note also reaches the closed prompt**, since the background notes are shared. `capture.move_is_one_change` says a file that was moved and had a line edited shows as one change. A judge might now read the 50% threshold as an exception to that. Closed runs haven't been rerun with the note.

## Files

- `.claude/agents/text-tests-suite.md`, `.claude/agents/text-tests-suite-codex.md`: the instructions.
- `suite/vscode/`: the stub, with its `package.json`.
- `lib/suite-workspace.mjs`: prepares the workspace.
- `lib/vscode-register.mjs`: loads the stub for the load check, which runs outside a workspace.
- `tests/context-notes-suite.md`: git's rename threshold. It was first added to the shared `tests/context-notes.md`, then moved to notes of its own for suite runs, because judges who only read the code took it as an exception to a move test (report 13).
- `claude/watch.mjs`: the live monitor, which also follows Codex's `wait` calls on long-running scripts.
