# Open runs at high effort, and runs split by test group

**Open, high effort** (complete): 12 of 13 bugs caught, no false alarm, 1.4 minutes per run. Given tools, the agents barely used them, 2 to 4 calls per run, where the max-effort open agents had rebuilt a whole test harness. The miss is the same pure-rename bug the closed high-effort runs missed.

**Split by group, max effort** (stopped halfway, since it saves no time): 7 of the 15 conditions finished, and the prompt-id condition has 3 of its 7 groups. On every finished condition it detected exactly what the whole-suite max-effort runs detected. On clean code it flagged one test. That is not a false alarm but a real bug the real suite doesn't cover, confirmed by a reproduction. The price: about 4.5 times the output tokens of a whole-suite max run for each condition, and it ran through your five-hour window.

## What changed since the last report

- **Smoke test replaced**: it is gone from the behavior tests. Both instruction sets now say that if the extension has a syntax error or would crash while loading or activating, every test is reported failed. For the two crash bugs, every test failing is now the expected answer. Both batches gave it, 59 of 59.
- **Open runs**: headless CLI sessions like the closed ones, each in a temporary workspace outside the repository holding its own copy of the code, a scratch folder and the prompt file. Available tools are Bash, Read, Write, Edit, Glob and Grep. Bash is unrestricted, and Claude Code itself confines the file tools to the workspace; a probe showed writes and reads outside it refused. No CLAUDE.md is loaded, and git cannot climb into this repository.
- **Closed runs**: reads are now confined to the run's own folder.
- **Groups**: `claude/build-prompt.mjs --group <name>` keeps the background and the full source, but lists only that group's tests. `behavior-tests.md` stays one file.
- **Cache**: switched from the 1-hour to the 5-minute TTL partway through the split batch: 13 runs used 1 hour, 39 used 5 minutes.

## Open runs at high effort

| Bug | Real suite | Closed, high | Open, high | Open, max (first experiment) |
| --- | --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | all pass, twice | all pass, twice |
| startup-rename | fails to load | caught | 59 of 59 | caught |
| sync-await | crash | caught | 59 of 59 | caught |
| binary-default | 8 | 7 of 8 | 7 of 8 | 7 of 8 |
| tree-order | 1 | 1 of 1, 1 extra | 1 of 1, 1 extra | 1 of 1 |
| index-mtime | 1 | caught | caught | caught |
| prompt-id | 1 | caught | caught | caught |
| interrupt-equality | 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| advert-withdraw | 1 | caught | caught | caught |
| hook-cwd | 2 | 1 of 2 | 1 of 2 | 1 of 2 |
| stamp-seconds | 3 | 1 of 3 | 2 of 3 | 3 of 3 |
| empty-image | 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| pure-rename-dropped | 3 | missed | missed | 3 of 3 |
| subagent-end | 1 | caught | caught | caught |

The crash rows are scored differently in the earlier columns, which used the smoke test.

**How the tools were used**: 11 of the 15 runs made only the two calls the task needs: the command and reading its file. The other four each settled one question:
- A search confirming `startHookServer` is not exported.
- `node --check` on the file with the syntax error.
- Two small experiments reproducing the git index race.
- A second read of the prompt file.

No run built a harness. The verdicts matched the closed high-effort runs except for one more stamp test caught, and that run made no extra tool calls, so it is run-to-run variation rather than the tools.

| | Open, high | Open, max (first experiment) |
| --- | --- | --- |
| Time per run | median 1.4 min, 0.6 to 1.7 | median 14.1 min |
| Output tokens per run, median | 9k | 102k |
| Uncached input per run, median | 27k | 193k |
| Final context per run, median | 40k | 172k |
| Tool calls per run | 2 to 4 | median 19 |
| Harness rebuilt | never | 13 of 15 runs |
| Cost Claude Code reported | $5.89 for 15 runs | not reported |

## Split by group, max effort

Seven agents per condition, one per group: capture, install, retention, running, server, view and workspace. Each sees the full source but only its own group's tests.

| Bug | Real suite | Whole suite, max | Split by group, max |
| --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | 1 flagged (a real bug, below), then all pass |
| startup-rename | fails to load | caught | 59 of 59 |
| sync-await | crash | caught | 59 of 59 |
| binary-default | 8 | 7 of 8, 1 extra | 7 of 8 |
| tree-order | 1 | 1 of 1, 1 extra | 1 of 1, 1 extra |
| index-mtime | 1 | caught | caught |
| prompt-id | 1 | caught | caught, 3 of 7 groups done |
| the other 7 bugs | | all 7 caught | not run yet |

**The bug it found**: when an editing tool names a file outside every repository, and that file does not exist when the turn ends, `addChange` still records a change with neither side. That happens with a failed write, or a file created and deleted within the turn. So a turn that changed nothing publishes a diff listing a phantom file, replacing the previous turn's diff and clearing its before-images. That breaks `retention.no_change_leaves_previous_diff`, and no real test covers the case. The retention group's agent found it by reading. `repro/ghost-change.mjs` reproduces it against the real code:

```sh
node --import ./test/setup.js jev/repro/ghost-change.mjs
```

It prints the previous diff listing `f.txt`, then a turn that changed nothing publishing a diff listing `never-written.md`.

**What splitting costs**:

| | Whole suite, max | Split by group, max |
| --- | --- | --- |
| Output tokens per condition, median | 69k | 313k over 7 runs; group medians run from 21k (install) to 48k (running) |
| Uncached input per condition, median | 43k | 159k over 7 runs |
| Final context per agent, median | 128k | 64k, from 27k to 118k |
| Agent time per condition, median | 9.1 min | 43 min |
| Wall time per condition, groups run together | 9.1 min | 8.4 min, the slowest group |
| Cost per condition | about $1.62 | $7.08 reported |

Each group agent still reads and reasons through the whole codebase, so the fixed cost of understanding the code is paid seven times. Thinking also doesn't shrink in proportion to the number of tests: the install agent, with 5 tests, still used about 21k output tokens.

## The five-hour window

The runner stops launching new runs once a finished run reports the window above the threshold. The open batch moved the window from about 16% to 21%. The split batch moved it from 24% to 96% over 52 runs, about 1.4 points per max-effort run. The stop was set at 80%. It prevented new launches, but readings lag several minutes behind use, so the real figure was already higher when a run reported 80%. That lag, the 10 runs already in flight and this session took the window to 100%. The stop has to leave room for both the lag and the runs in flight, or runs should go fewer at a time.

## The cache TTL

- **The CLI sessions defaulted to the 1-hour TTL.** They wrote their cache with it, while the subagents in the first experiment used 5 minutes.
- **`CLAUDE_CODE_PROMPT_CACHE_TTL=5m` switches it.** The runner now sets it by default.
- **The model checks out.** Claude Code's reported cost matches $4 per million input tokens and $20 output, with 5-minute writes at 1.25 times input, 1-hour writes at 2 times and reads at a tenth. It matches exactly on the runs recorded since the change.
- **At max effort the saving is small.** Output is 84% of the cost, so the 5-minute cache saved $2.65 of $43.05 on the split batch, about 6%. At high effort, where output is small, the same switch would save about a fifth.

## Why the split batch stopped

Splitting did not save time. With all seven groups running together, a condition takes as long as its slowest group, 8.4 minutes, against 9.1 for the first experiment's whole-suite max runs, and it costs 4.4 times as much. So the batch stopped at 52 of its 105 runs. The 53 unused run folders, r115 to r167, are still in `runs/`.

## Files

- `repro/ghost-change.mjs`: the bug reproduction.
- `claude/run-cli.mjs`:
  - `--cache-ttl`, default 5 minutes.
  - `--stop-at` and `--timeout-minutes`.
  - Open runs in a temporary workspace.
  - Group-aware prompts.
- `claude/record-pending.mjs`: records runs whose sessions outlived their runner, as when I switched the cache mid-batch.
- `claude/make-run.mjs --groups all`: one run per group.
- `claude/build-prompt.mjs --group <name>`: a prompt with one group's tests.
- `claude/report.mjs`: now merges the group runs of each condition.
- Per-run logs: `logs/*-claude-r48-*` to `r62` for the open batch, `r63` to `r114` for the split batch.
