# Closed runs on Fable 5.1 at high effort

Fable 5.1 caught 12 of the 13 bugs, with no false alarm on clean code. Leaving out the two crash bugs, it flagged 18 of the 25 real failures. That is the same count as Opus 5.5 at high effort, but it missed the tree-order bug outright, which every Opus batch caught.

Its runs took 2.3 minutes against 1.6 for Opus, and the batch cost about 2.6 times as much on the same cache. It also used the five-hour window much faster than its price suggests.

## How it ran

It ran exactly like the Opus high-effort closed batch, except for `--model claude-fable-5-1`:

- headless CLI sessions;
- the closed instructions as the whole system prompt;
- only `Bash` and `Read`;
- the same 15 conditions, 8 at a time;
- the 5-minute cache and the crash rule.

Every run made exactly the two calls the task needs.

## Correctness

| Bug | Real suite | Opus 5.5, high | Opus 5.5, extra high | Fable 5.1, high |
| --- | --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | all pass, twice | all pass, twice |
| startup-rename | fails to load | caught | 59 of 59 | 59 of 59 |
| sync-await | crash | caught | 59 of 59 | 59 of 59 |
| binary-default | 8 | 7 of 8 | 7 of 8 | 7 of 8 |
| tree-order | 1 | 1 of 1, 1 extra | 1 of 1, 1 extra | missed |
| index-mtime | 1 | caught | caught | caught |
| prompt-id | 1 | caught | caught | caught |
| interrupt-equality | 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| advert-withdraw | 1 | caught | caught | caught |
| hook-cwd | 2 | 1 of 2 | 1 of 2 | 1 of 2 |
| stamp-seconds | 3 | 1 of 3 | 3 of 3 | 1 of 3 |
| empty-image | 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| pure-rename-dropped | 3 | missed | 2 of 3 | 1 of 3 |
| subagent-end | 1 | caught | caught | caught |

The Opus high batch ran before the crash rule, so its crash rows are counted differently.

- **tree-order, missed**: the bug makes the comparator put files before folders. Fable passed both ordering tests, `capture.explorer_order` and `workspace.outside_files_come_last_in_tree_order`.
- **pure-rename-dropped, 1 of 3**: it named the dropped move on `capture.move_is_one_change`, but passed the rename and ordering tests that follow from it. Opus caught none at high effort and two at extra high.
- **stamp-seconds, 1 of 3**: only the look-versus-end test, like Opus at high effort.
- **Reasons**: every failure it reported named the actual defect, for example `copyFileSync` used where `copyPreservingMtime` is defined but never called.
- **No extras**: it raised neither of the legitimate extras Opus raised.

## Speed, tokens and cost

| | Opus 5.5, high | Fable 5.1, high |
| --- | --- | --- |
| Real failures flagged, 11 non-crash bugs | 18 of 25 | 18 of 25 |
| Time per run | median 1.6 min | median 2.3 min |
| Batch wall time, 8 at a time | 3.9 min | 5.3 min |
| Output tokens per run, median | 11k | 12k |
| Uncached input per run, median | 27k | 29k |
| Final context per run, median | 40k | 41k |
| Output tokens per second, median | 115 | 86 |
| Cost on the 5-minute cache, 15 runs | $5.37 | $13.94 |

- **Price**: Opus rates would give $5.61 for the same tokens, so Fable costs about 2.5 times as much per token.
- **Speed**: it wrote about as many tokens as Opus, but about a quarter slower, so runs took longer.
- **Five-hour window**: it read 37% before the batch and 91% half a minute after it ended, and the reading may still be catching up.
  - That is at least 54 points for $13.94, about 3.9 points per dollar, against about 2.2 for the last two Opus batches.
  - Per token, a Fable run weighed on the window roughly four times as much as an Opus run.
  - The figure rests on delayed readings and includes this session.

## Caveats

- **One run per bug.** The tree-order miss is a single run, and results on single tests have varied between runs.
- **The Opus columns come from earlier batches.** The high one ran before the crash rule, which only affects the crash rows.

## Files

- `claude/report.mjs`: adds a model column and includes the new batch.
- Per-run logs: `logs/*-claude-r198-*` to `r212`.
