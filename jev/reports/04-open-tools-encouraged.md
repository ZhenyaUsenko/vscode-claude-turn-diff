# Open runs with tool use encouraged

This batch repeated the open approach at high effort with one sentence changed. "Reading the code is usually enough" became "use tools wherever you think they will make a verdict more correct, or get you to it faster, than reading alone". All 13 bugs were detected with no false alarm on clean code, against 12 of 13 for the previous open batch.

The agents used tools more often, but lightly. 14 of 15 runs made at least one call beyond the two the task needs, the largest experiment was 69 lines, and runs stayed at about 1.5 minutes.

The gain did not come from the tools. Both improved verdicts came from runs whose only extra call was a syntax check. Compared on the same cache, the batch cost about 23% more.

## What changed

- **Instructions**: `.claude/agents/text-tests-open-tools.md` is the open set with that one sentence replaced. The safety rules are the same. `text-tests-open.md` is unchanged, so the earlier batch can be rerun as it was.
- **Runner**: `claude/run-cli.mjs --agent <definition>` picks the instructions, and each run's log names them.
- **Everything else as in the previous open batch**:
  - headless CLI sessions on Opus 5.5 at high effort;
  - a temporary workspace outside the repository;
  - the same six tools;
  - the 5-minute cache;
  - the same 15 conditions.

## Correctness

| Bug | Real suite | Open, high, reading encouraged | Open, high, tools encouraged |
| --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | all pass, twice |
| startup-rename | fails to load | 59 of 59 | 59 of 59 |
| sync-await | crash | 59 of 59 | 59 of 59 |
| binary-default | 8 | 7 of 8 | 7 of 8 |
| tree-order | 1 | 1 of 1, 1 extra | 1 of 1 |
| index-mtime | 1 | caught | caught |
| prompt-id | 1 | caught | caught |
| interrupt-equality | 2 | 2 of 2 | 2 of 2 |
| advert-withdraw | 1 | caught | caught |
| hook-cwd | 2 | 1 of 2 | 1 of 2 |
| stamp-seconds | 3 | 2 of 3 | 3 of 3 |
| empty-image | 2 | 2 of 2 | 2 of 2 |
| pure-rename-dropped | 3 | missed | 1 of 3 |
| subagent-end | 1 | caught | caught |

- **stamp-seconds, 3 of 3**: each reason names the whole-second stamp and what it makes repeat. The run's only extra calls were a directory listing and a syntax check. Across the three high-effort batches this bug has scored 1, 2 and 3 of 3 with no experiment involved, so single runs vary by that much.
- **pure-rename-dropped, 1 of 3**: it failed `capture.move_is_one_change` because a file that was only moved is dropped. It still passed `view.move_renders_as_rename` and `capture.explorer_order`, which the real suite fails for the same reason. This run also made only a syntax check.
- **tree-order, the extra went away**: the earlier high batches also failed `workspace.outside_files_come_last_in_tree_order`, correctly by the statement, since outside files go through the same comparator. This run passed it. Its experiment sorted repository paths only, so the pass came from reading, not from the experiment.
- **Unchanged**: the binary and hook-cwd misses are the same statement-bound ones as in every batch.

## How the tools were used

| | Reading encouraged | Tools encouraged |
| --- | --- | --- |
| Runs with calls beyond the two needed | 4 of 15 | 14 of 15 |
| Tool calls per run | 2 to 4, median 2 | 2 to 6, median 3 |
| Runs that ran the extension's code | 1 | 6 |
| Largest experiment | two small experiments on the git index race | 69 lines in 5 files |

- **Syntax check first, 9 runs**: `node --check` over every source file, usually with `bash -n` on the hook script. The crash rule makes this the cheapest check before judging. It found the syntax error in the sync-await run.
- **Confirming a bug found by reading, 5 runs**:
  - a search and a load attempt confirmed the missing `startHookServer` export;
  - sorting sample paths confirmed files now come before folders;
  - a one-liner confirmed the binary check answers yes when a side is missing;
  - a script reproduced the git index race;
  - a fake transcript went through the interrupt check, followed by two scenario scripts.
- **Double-checking on correct code, 3 runs**:
  - two runs whose bugs were elsewhere reproduced the git index race anyway, to check `capture.same_size_edit_a_second_later`;
  - one clean run wrote a small vscode stub and two scenario scripts covering 11 tests.
- **No harness was rebuilt.** The max-effort open agents in the first experiment wrote 570 to 1,440 lines per run.
- **Experiments confirmed verdicts and never changed one.** Every bug caught here was also caught by reading in the earlier high-effort batches, and the two gains came from runs that ran no experiment.

## Speed, tokens and cost

| | Reading encouraged | Tools encouraged |
| --- | --- | --- |
| Time per run | median 1.4 min, 0.6 to 1.7 | median 1.5 min, 0.7 to 2.2 |
| Batch wall time, 8 at a time | 3.1 min | 3.6 min |
| Output tokens | 124k in total, 9k median | 147k in total, 9k median |
| Input tokens processed per run, median, cache reads included | 43k | 84k |
| Uncached input per run, median | 27k | 35k |
| Final context per run, median | 40k | 41k |
| Cost Claude Code reported | $5.89, 1-hour cache | $5.70, 5-minute cache |
| Cost on the 5-minute cache | $4.64 | $5.70 |

- **Input**: each extra tool call re-sends the context, which accounts for most of the added input.
- **Cost**: the earlier batch ran before the cache switch. On the same cache it cost $4.64, so encouraging tools cost about 23% more.
- **Five-hour window**: about 13 points, from 5% before the batch to 18% once the reading caught up. Readings lag several minutes behind use, so the last run reported only 17%. The figure includes this session.

## Rule compliance

- **No rule flags**: no reads of the test directory, TECHNICAL.md, git history or other runs, and no `npm test`.
- **Isolation**: every experiment set `HOME` inside its scratch folder. Every one that ran git or the extension's code also set `GIT_CEILING_DIRECTORIES`.
- **Your machine**: `~/.claude/settings.json` is unchanged since yesterday. Nothing appeared under `~/.claude/turn-diff` for the temporary workspaces, and no processes were left running.

## Caveats

- **One run per bug per batch.** The whole difference in detection rests on one partial catch, by a run that used no experiment. This batch does not show that encouraging tools improves correctness.
- **High effort only.** At max effort, the open agents rebuilt harnesses even when told reading is usually enough, so the same sentence might matter more or less there.

## Files

- `.claude/agents/text-tests-open-tools.md`: the instructions.
- `claude/run-cli.mjs`: the new `--agent` option.
- `claude/analyze-open.mjs <batch>`: the tool-use table for one batch.
- `claude/report.mjs`: includes the new batch.
- Per-run logs: `logs/*-claude-r168-*` to `r182`.
