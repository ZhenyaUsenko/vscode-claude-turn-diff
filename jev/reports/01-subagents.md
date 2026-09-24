# Text tests judged by Claude

Both approaches caught all 13 bugs and raised no false alarm on clean code. On the 26 tests the real suite fails (leaving out the syntax error, which crashes it), each approach flagged 24, and every difference from the real suite traces to what a statement says rather than to a misreading of the code. The price is time and tokens: a closed run takes about 9 minutes, an open run about 14, the real suite 15 seconds. Given tools, the agents rebuilt a test harness from scratch in 13 of 15 runs, and it found no failure that reading had missed.

## Setup

- **Tests**: the 59 behavior statements, rewritten for people, plus the new smoke test: 60 in all. Background notes are in Markdown.
- **Prompt file**: one per run, written by `claude/build-prompt.mjs`. It holds the notes, the full source (package.json, 16 source files, the hook script) with separator lines removed, and the tests: about 1,500 lines.
- **Subagents**: a new general-purpose subagent for every run, on `claude-opus-5-5`, confirmed in every transcript. Claude Code has no way to delete a finished subagent. A new Agent call always starts with an empty context, and a finished subagent does nothing unless someone messages it again.
- **Closed approach**: run the one command and read the file it writes, nothing else. The agent definition in `.claude/agents/text-tests-closed.md` would enforce this at the harness level, but Claude Code loads agent definitions only when a session starts. The instructions went inline instead, and I checked every transcript: all 15 closed runs made only the permitted calls, 2 to 5 of them.
- **Open approach**: any tool, but only on its own copy of the code and its scratch directory. The rules: no test directory, no TECHNICAL.md, no git history or other runs, no `npm test`, and `HOME` inside the scratch directory.
- **Code under test**: each run got its own copy with at most one bug applied. Directory names (r01 to r31) and agent descriptions were opaque, so no agent could read its bug from a name.
- **Calibration**: two clean closed runs came first. Both passed all 60, so the wording stayed as it was.

## The bugs

Each is a one to four line edit, defined in `lib/bugs.mjs`.

| Bug | File | What changed | Real suite |
| --- | --- | --- | --- |
| startup-rename | extension.js | Imports and calls `startHookServer`, but server.js exports `startServer` | smoke test fails |
| sync-await | turn/collect.js | A synchronous function awaits `readFile`, a syntax error | crashes at load |
| binary-default | turn/collect.js | The binary check answers yes when a side is missing, so every added and deleted file is skipped | 8 fail |
| tree-order | utils/files.js | Files sort before folders | 1 fails |
| index-mtime | utils/git.js | The index copy gets a fresh modification time, so git misses same-size edits within one second | 1 fails |
| prompt-id | turn/index.js | Every prompt event restarts the turn, even one carrying the running turn's id | 1 fails |
| interrupt-equality | store/transcript.js | The interrupt marker must equal the entry's text instead of starting it | 2 fail |
| advert-withdraw | server.js | Closing a window deletes the advert even when another window owns it now | 1 fails |
| hook-cwd | hooks/turn-diff.sh | The project comes from `$PWD` instead of the transcript path | 2 fail |
| stamp-seconds | store/manifest.js | The publish stamp has whole-second resolution | 3 fail, sometimes 2 |
| empty-image | turn/collect.js | No before-image is written for an empty file | 2 fail |
| pure-rename-dropped | turn/collect.js | A move without edits is dropped as unchanged | 3 fail |
| subagent-end | turn/index.js | End events from subagents end the turn | 1 fails |

## Correctness

| Bug | Real suite | Closed | Open |
| --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | all pass, twice |
| startup-rename | 1 | caught 1 of 1 | caught 1 of 1 |
| sync-await | crash | 55 fail, 5 pass | 54 fail, 6 pass |
| binary-default | 8 | caught 7 of 8, 1 extra | caught 7 of 8 |
| tree-order | 1 | caught 1 of 1, 1 extra | caught 1 of 1 |
| index-mtime | 1 | caught 1 of 1 | caught 1 of 1 |
| prompt-id | 1 | caught 1 of 1 | caught 1 of 1 |
| interrupt-equality | 2 | caught 2 of 2 | caught 2 of 2 |
| advert-withdraw | 1 | caught 1 of 1 | caught 1 of 1 |
| hook-cwd | 2 | caught 1 of 2 | caught 1 of 2 |
| stamp-seconds | 3 | caught 3 of 3 | caught 3 of 3 |
| empty-image | 2 | caught 2 of 2 | caught 2 of 2 |
| pure-rename-dropped | 3 | caught 3 of 3 | caught 3 of 3 |
| subagent-end | 1 | caught 1 of 1 | caught 1 of 1 |

Every failing verdict came with a one-sentence reason naming the actual defect, for example that `isEndOfTurn` compares with `===` where it should check the prefix.

Where the agents differ from the real suite:

- **Missed by both, binary-default, `capture.changed_and_changed_back`**: the real test also creates a new file and asserts it is listed, and that is what fails. The statement only says a restored file is not listed, which stays true. The statement is narrower than its test.
- **Missed by both, hook-cwd, `server.end_through_hook_opens_diff`**: the real test fails only because macOS reaches the temporary directory through the `/var` to `/private/var` symlink, so a key built from `$PWD` no longer matches. Without that quirk the behavior still holds as long as Claude has not changed directory, so passing it is defensible.
- **Closed extra, binary-default, `capture.binary_skipped`**: the statement defines binary as a zero byte within the first 8000 bytes. With the bug, a file counts as binary without one. Correct by the statement; the real test only checks a modified binary file.
- **Closed extra, tree-order, `workspace.outside_files_come_last_in_tree_order`**: outside files go through the same comparator, so folders-before-files is broken for them too. The real test's two files sit in sibling folders, where the flip changes nothing. The open agent ran a similar scenario and passed the test.
- **sync-await**: the real suite cannot load, so no test runs at all. Both approaches named the syntax error and its import chain. Both kept the five install tests passing, because the settings check never imports the broken file, and the open run also kept the hook-script test passing.

Closed runs judged each statement by its full meaning. Open runs, whose experiments looked much like the real tests, matched the real suite more literally.

## Speed and tokens

| | Real suite | Closed | Open |
| --- | --- | --- | --- |
| Time per run | 15 s | median 9.1 min, 6.1 to 11.3 | median 14.1 min, 6.2 to 19.2 |
| Output tokens per run, median | none | 69k | 102k |
| Input tokens processed per run, median, cache reads included | none | 124k | 2.34M |
| Uncached input per run, median | none | 43k | 193k |
| Final context per run, median | none | 128k | 172k |
| Input served from cache | | 65% | 92% |
| Tool calls per run, median | | 2 | 19 |
| Total over 15 runs | | 136 agent-minutes, 1.04M output, 2.24M input | 207 agent-minutes, 1.45M output, 34.7M input |

Runs went in parallel: the 13 closed bug runs finished within about 11 minutes of wall-clock time. Most output tokens are thinking.

## How the open agents worked

- **13 of 15 runs rebuilt a harness from scratch**, including both clean runs. Each wrote a vscode stub with a loader hook, a way to run every process with `HOME` and `TMPDIR` inside its scratch directory, helpers that create git repositories and drive begin, arm and end, and scenario scripts per area: 8 to 18 files and 570 to 1,440 lines per run. Each then said it had checked 56 to 60 of the 60 tests by running code.
- **The scripts were experiments, not assertions.** They printed manifests, before-images and the commands VS Code received, and the agent read the output.
- **Two runs were selective.** With the syntax error, only the install check and the hook script could load, so that run tested just those, in 179 lines. With the binary bug, the agent spotted the defect by reading, then checked 24 tests by running code, in 478 lines.
- **"Reading the code is usually enough" did not hold them back.** Every open run executed code.
- **Execution confirmed and never discovered.** Open and closed runs detected the same bugs and missed the same two tests. The only differences are the two closed extras and one hook-script test under the syntax error, which the open run kept passing. The git race run, for example, reproduced the missed edit after reading the cause.
- **Nothing carried over between runs**, so every run paid for its own harness. That is where the extra time and roughly 19 times the input tokens go.

Rule compliance:

- **No forbidden reads.** No transcript shows a read of the test directory, TECHNICAL.md, git history or another run, or a run of `npm test`.
- **Your `~/.claude` is untouched.** `settings.json` and the installed hook script have the same hashes as before, and no new project directories appeared under `~/.claude/turn-diff`.
- **Git reached the repository twice.** The scratch directories sit inside this repository. Before I added the `GIT_CEILING_DIRECTORIES` rule, r17 and r18 each ran an experiment whose workspace folder was not a repository, so the extension's snapshot walked up into this one and wrote unreachable loose objects. Both agents reported it themselves. The index, branches and working tree were untouched, which I checked, and `git gc` will prune the objects. The later runs got the rule, and the agent definition now includes it.
- **One run stalled.** r16 stopped on a command that never ran, which began with `rm -rf` over globs and was most likely held for an approval nobody could give. I stopped it after 37 minutes, 28 of them spent waiting, and replaced it with r31.

## Compared with the real tests

- **The real suite** takes 15 seconds, costs nothing and is deterministic. It caught all 13 bugs, but I chose bugs it catches, and it reports a syntax error as a crash with no per-test results.
- **Text tests** take minutes and tokens per run and give a judgment, not a proof. There is no test code to maintain, and every failure comes with its reason. They reach past the concrete scenario, as the two closed extras show, and they are only as broad as their wording, as the binary miss shows.
- **Stability**: 4 clean runs gave 240 verdicts and no false alarm. Across bug runs, closed and open agreed on every detection.
- **Caveats**: one run per bug per approach. The bugs are single edits I wrote knowing the tests. About 1,100 lines of source fit in one read, and a larger codebase would change the economics.

## What changed in the repository

- **`behavior-tests.md`**: rewritten for people, with an introduction, a list of terms, no `files:` lines, and the smoke test `smoke.starts_cleanly` first. Ids are unchanged.
- **`context-notes.md`**: Markdown sections, a table of hook events and lists. Still outside-world facts only.
- **Real suite**: `test/cases/smoke.test.js` runs first. It syntax-checks every source file and the hook script, activates the extension against the stub, and checks that nothing was logged as an error and the three declared commands were registered. The vscode stub gained `window`, `registerCommand` and two event hooks. `npm test` passes 60 of 60. It has since moved out of the real suite: `lib/load-check.mjs` runs the same check against its own stub in `lib/vscode-stub.mjs`, `test/` is back to its committed state, and `npm test` passes 59 of 59.
- **Runner**: `claude/build-prompt.mjs`, `claude/run-real.mjs`, `claude/make-run.mjs`, `claude/record-run.mjs`, `claude/report.mjs` and `claude/analyze-open.mjs`, with their `lib/` modules. The README describes them.
- **Agent definitions**: `.claude/agents/text-tests-closed.md` and `text-tests-open.md`, usable from the next session.
- **Per-run logs**: `logs/*-claude-*.md`, one per run, with the verdicts beside the real suite's, every tool call and the final message.
- **`runs/`**: gitignored. Code copies, prompt files, the open runs' harnesses and transcript copies.
- **Nothing is committed.**

## Worth trying next

- Repeat each bug two or three times per approach to see how stable single verdicts are.
- Widen `capture.changed_and_changed_back` to also say that files that do differ, including new ones, are listed.
- Give open runs a shared, prebuilt harness, and see whether execution then earns its cost.
- Try a smaller model on the closed approach, which needs no tools and was already exact here.
