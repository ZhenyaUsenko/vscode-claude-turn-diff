# Open runs required to write and run a full test suite

Opus 5.5 at high effort, open approach, told to write a test suite covering every test and to give each verdict from its results. Every run did: 560 to 1,169 lines of test code per run, covering all 59 tests. All 13 bugs were detected with no false alarm.

Leaving out the two crash bugs, the real suite fails 25 tests, and these runs flagged 22 of them. That matches closed runs at extra-high effort, which only read the code, and is one short of max effort.

One run found a real bug by running its suite: the phantom change that a turn with no changes publishes. Each run took 6.9 minutes, and the batch cost 4.5 times as much as the reading-encouraged open batch, and 2.5 times as much as closed extra-high.

## What changed

- **Instructions**: `.claude/agents/text-tests-open-suite.md`. "Write a test suite in your scratch directory that checks every test in the file against the code, run it, and give each verdict from its result. Read the code to work out how to test each behavior, not in place of testing it."
- **The crash note**: telling agents to skip the tests when the code crashes contradicts requiring a suite, so the note became part of the suite. The suite must check that every source file parses and that the extension loads and activates. If that check fails, every test fails, with that error as the reason. Both crash bugs came back with all 59 failed, as expected.
- **Everything else as in the other open batches**:
  - headless CLI sessions;
  - a temporary workspace outside the repository;
  - the same six tools;
  - the 5-minute cache;
  - the same safety rules and 15 conditions.
- **Two waves**: the runs went in waves of 8 and 7, with a check of cost and the five-hour window in between, because suite runs cost several times more than reading runs and window readings lag.

## Correctness

| Bug | Real suite | Open, high, reading encouraged | Open, high, tools encouraged | Open, high, full suite | Closed, extra high |
| --- | --- | --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | all pass, twice | all pass, twice | all pass, twice |
| startup-rename | fails to load | 59 of 59 | 59 of 59 | 59 of 59 | 59 of 59 |
| sync-await | crash | 59 of 59 | 59 of 59 | 59 of 59 | 59 of 59 |
| binary-default | 8 | 7 of 8 | 7 of 8 | 7 of 8 | 7 of 8 |
| tree-order | 1 | 1 of 1, 1 extra | 1 of 1 | 1 of 1, 1 extra | 1 of 1, 1 extra |
| index-mtime | 1 | caught | caught | caught | caught |
| prompt-id | 1 | caught | caught | caught | caught |
| interrupt-equality | 2 | 2 of 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| advert-withdraw | 1 | caught | caught | caught, 2 extra | caught |
| hook-cwd | 2 | 1 of 2 | 1 of 2 | 1 of 2 | 1 of 2 |
| stamp-seconds | 3 | 2 of 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| empty-image | 2 | 2 of 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| pure-rename-dropped | 3 | missed | 1 of 3 | 2 of 3 | 2 of 3 |
| subagent-end | 1 | caught | caught | caught | caught |
| **Real failures flagged, 11 non-crash bugs** | 25 | 19 | 21 | 22 | 22 |

- **The two extras under advert-withdraw are a real bug**, the phantom change found earlier and reproduced in `repro/ghost-change.mjs`.
  - The run's suite included a turn whose only editing tool named an outside file that was never created.
  - The turn published an entry for that file and replaced the previous diff.
  - That failed `retention.no_change_leaves_previous_diff` and `running.only_a_publishing_end_reports_published`, both correctly by their statements.
  - The other 14 suites never tried that case, including both clean runs.
- **The tree-order extra** is the same legitimate one as before: outside files go through the same comparator.
- **Verdicts came from running.** For example, the stamp run's reasons quote the stamp its test observed for both publishes, `1790188860-55903`.
- **Misses**:
  - the same two statement-bound tests as every batch;
  - `capture.explorer_order` under pure-rename-dropped, which only max effort caught.

## How the suites were built

- **Every run** wrote:
  - a vscode mock;
  - a module loader hook that resolves `vscode` to it;
  - one suite file, sometimes with a shell script to run it.
- **Size**: 560 to 1,169 lines, the smallest for the two crash bugs. That is close to the 570 to 1,440 lines the max-effort open subagents wrote without being asked.
- **Coverage**: every run's `ran:` line listed all 59 tests.
- **Tool calls**: 7 to 11 per run: the command, one read, then writing the suite, running it and fixing it.

## Where the time went

`claude/analyze-time.mjs` splits each run by the timestamps in its transcript: thinking, writing, and tools running.

| | Median per run | Share of all time |
| --- | --- | --- |
| Thinking | 197 s | 44% |
| Writing the suite's code | 168 s | 40% |
| Running the suite | 25 s | 10% |
| Writing the final verdicts | 8 s | 3% |
| Other calls | 14 s | 4% |

- **Thinking took about as long as in a closed extra-high run**, where it is 94% of the time, 184 s median. Writing and running the suite came on top, which is where the extra 3.7 minutes per run went.
- **The suite's code** was about 25.5k tokens per run, 53% of all output, written at about 150 tokens a second.
- **Running was quick**, except in the binary-default run, whose suite ran for 3.4 minutes.
- **The crash-bug runs** still spent over two minutes writing suites whose outcome the syntax check had already settled.

## Speed, tokens and cost

| | Open, high, reading encouraged | Open, high, tools encouraged | Open, high, full suite | Closed, extra high | Open, max, subagents |
| --- | --- | --- | --- | --- | --- |
| Real failures flagged, 11 non-crash bugs | 19 of 25 | 21 of 25 | 22 of 25 | 22 of 25 | 23 of 25 |
| Time per run, median | 1.4 min | 1.5 min | 6.9 min | 3.2 min | 14.1 min |
| Output tokens per run, median | 9k | 9k | 48k | 22k | 102k |
| Input tokens processed per run, median, cache reads included | 43k | 84k | 433k | 36k | 2.34M |
| Uncached input per run, median | 27k | 35k | 82k | 27k | 193k |
| Final context per run, median | 40k | 41k | 87k | 54k | 172k |
| Tool calls per run, median | 2 | 3 | 9 | 2 | 19 |
| Cost on the 5-minute cache, 15 runs | $4.64 | $5.70 | $21.06 | $8.58 | about $56, estimated |

- **Against closed extra high**: the same 22 real failures, for 2.5 times the cost and about twice the time per run. The suite also found the phantom-change bug. Among the other runs, only a max-effort split agent found it, by reading.
- **Against the max-effort open subagents**, which also built suites: one fewer real failure, in half the time, at about 38% of the cost.
- **Five-hour window**: it read 1% before the batch, 17% between the waves and 32% half a minute after the end. Readings lag, so the final figure may still rise.

## Rule compliance

- **No rule flags.**
- **Isolation**: all 17 commands that ran the suites or the extension's code set `HOME` inside scratch and `GIT_CEILING_DIRECTORIES`. The one other `node` call only compared the suite's test ids with the prompt's.
- **Your machine**: `~/.claude/settings.json` is unchanged since yesterday. Nothing appeared under `~/.claude/turn-diff` for the temporary workspaces, and no processes were left running.

## Caveats

- **One run per bug.** Finding the phantom-change bug depended on one suite happening to try that case.
- **Max open is not like for like.** Those runs were subagents with about 31k tokens of starting context, and their cost is estimated from tokens.

## Files

- `.claude/agents/text-tests-open-suite.md`: the instructions.
- `claude/analyze-time.mjs <batch>`: the time split above.
- `claude/report.mjs`: now also prints median uncached input and median final context, and includes this batch.
- Per-run logs: `logs/*-claude-r213-*` to `r227`. The suites themselves are in `runs/r213/scratch` to `runs/r227/scratch`.
