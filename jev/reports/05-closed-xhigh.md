# Closed runs at extra-high effort, and the effort picture

At extra-high effort, closed runs caught all 13 bugs with no false alarm on clean code. Leaving out the two crash bugs, the real suite fails 25 tests. Extra high flagged 22 of them, against 18 at high effort and 23 at max.

Each extra-high run took about twice as long as a high one and cost about 60% more. Max took about three times as long again.

## How it ran

It ran exactly like the high-effort closed batch:

- headless CLI sessions on Opus 5.5;
- the closed instructions as the whole system prompt;
- only `Bash` and `Read`, with `Bash` allowed only for the prompt command;
- the same 15 conditions, 8 at a time.

The only setting changed was `--effort xhigh`. The batch used the 5-minute cache and the crash rule.

Six runs read the prompt file in two or three parts. There were no other calls and no permission denials.

## Correctness by effort

| Bug | Real suite | High | Extra high | Max |
| --- | --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | all pass, twice | all pass, twice |
| startup-rename | fails to load | caught | 59 of 59 | caught |
| sync-await | crash | caught | 59 of 59 | caught |
| binary-default | 8 | 7 of 8 | 7 of 8 | 7 of 8, 1 extra |
| tree-order | 1 | 1 of 1, 1 extra | 1 of 1, 1 extra | 1 of 1, 1 extra |
| index-mtime | 1 | caught | caught | caught |
| prompt-id | 1 | caught | caught | caught |
| interrupt-equality | 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| advert-withdraw | 1 | caught | caught | caught |
| hook-cwd | 2 | 1 of 2 | 1 of 2 | 1 of 2 |
| stamp-seconds | 3 | 1 of 3 | 3 of 3 | 3 of 3 |
| empty-image | 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| pure-rename-dropped | 3 | missed | 2 of 3 | 3 of 3 |
| subagent-end | 1 | caught | caught | caught |

The high and max columns come from before the crash rule, when a smoke test scored the crash rows, so those rows are counted differently. The max column is the first experiment's subagents.

- **What extra high added over high**: all three stamp tests, and two of the three move tests under pure-rename-dropped. For the move bug it named the dropped move and followed it through to `view.move_renders_as_rename`. These are the failures that need a condition followed through to its consequence.
- **What max still added**:
  - the third move test, `capture.explorer_order`, whose statement mentions a moved file only in passing;
  - the legitimate binary extra, `capture.binary_skipped`, which fails by the statement's own definition of binary.
- **Missed at every level**: `capture.changed_and_changed_back` under binary-default and `server.end_through_hook_opens_diff` under hook-cwd. Both statements are narrower than their real tests, so more effort doesn't help.

## Speed, tokens and cost

| | High | Extra high | Max, subagents |
| --- | --- | --- | --- |
| Real failures flagged, 11 non-crash bugs | 18 of 25 | 22 of 25 | 23 of 25 |
| Time per run | median 1.6 min | median 3.2 min | median 9.1 min |
| Batch wall time | 3.9 min, 8 at a time | 7.2 min, 8 at a time | about 11 min, the 13 bug runs at once |
| Output tokens per run, median | 11k | 22k | 69k |
| Uncached input per run, median | 27k | 27k | 43k |
| Final context per run, median | 40k | 54k | 128k |
| Output tokens, 15 runs | 165k | 313k | 1.04M |
| Cost on the 5-minute cache, 15 runs | $5.37 | $8.58 | about $25, estimated |
| Output tokens per second, median | 115 | 117 | 128 |

- **Returns shrink fast.** Going from high to extra high caught 4 more real failures, for twice the time and 60% more cost. Going from extra high to max caught 1 more, plus one legitimate extra, for about three times the time and cost.
- **Speed barely changes.** Effort changes how long the model thinks, not how fast it writes.
- **How the costs compare**:
  - High reported $6.55 on the 1-hour cache. The table puts it on the 5-minute cache.
  - Subagents report no cost, so max is priced from its tokens at the same rates. Those rates give extra high's reported $8.55 to within 3 cents.
- **Five-hour window**: up to 19 points. It read 18% before the batch and 28% at its last run, but 37% once the reading caught up, because readings lag behind use. That includes this session, which wrote this report in between. Across the last two batches that is about 2.2 points per dollar of reported cost.

## Caveats

- **Max is not like for like.** Its runs were subagents, starting from about 31k tokens that included your CLAUDE.md, against about 3k for CLI runs. A CLI max batch would settle this. It would cost an estimated $20 to $25, roughly 45 to 55 points of the five-hour window.
- **One run per bug per level.** Single tests vary between runs: at high effort the stamp bug scored 1, 2 and 3 of 3 across three batches.
- **Instructions**: extra high ran with the crash rule, while high and max did not. The rule only affects the two crash bugs.

## Files

- `claude/report.mjs`: includes the new batch.
- Per-run logs: `logs/*-claude-r183-*` to `r197`.
