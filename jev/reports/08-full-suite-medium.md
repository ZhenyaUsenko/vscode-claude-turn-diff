# Full test suite at medium effort

At medium effort, the full-suite runs matched high effort on every planted bug: all 13 detected, 22 of the 25 real failures outside the crash bugs flagged, and no false alarm. Each run took 5.2 minutes instead of 6.9, and the batch cost 25% less, $15.84 against $21.06.

Most of the saving came from thinking. Writing the suite's code shrank much less, so a medium suite run still takes 1.6 times as long as a closed extra-high run with the same correctness.

## How it ran

It ran exactly like the high-effort full-suite batch, with `text-tests-open-suite` and `--effort medium`. All 15 runs went through one queue, 8 at a time.

## Correctness

| Bug | Real suite | Full suite, high | Full suite, medium | Closed, extra high |
| --- | --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | all pass, twice | all pass, twice |
| startup-rename | fails to load | 59 of 59 | 59 of 59 | 59 of 59 |
| sync-await | crash | 59 of 59 | 59 of 59 | 59 of 59 |
| binary-default | 8 | 7 of 8 | 7 of 8 | 7 of 8 |
| tree-order | 1 | 1 of 1, 1 extra | 1 of 1, 1 extra | 1 of 1, 1 extra |
| index-mtime | 1 | caught | caught | caught |
| prompt-id | 1 | caught | caught | caught |
| interrupt-equality | 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| advert-withdraw | 1 | caught, 2 extra | caught | caught |
| hook-cwd | 2 | 1 of 2 | 1 of 2 | 1 of 2 |
| stamp-seconds | 3 | 3 of 3 | 3 of 3 | 3 of 3 |
| empty-image | 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| pure-rename-dropped | 3 | 2 of 3 | 2 of 3 | 2 of 3 |
| subagent-end | 1 | caught | caught | caught |
| **Real failures flagged, 11 non-crash bugs** | 25 | 22 | 22 | 22 |

- **Same verdicts as high** on every planted bug, including all three stamp tests and two of the three move tests.
- **The phantom-change bug was not found this time.** At high effort one suite happened to try that case, and here none did.
- **The crash bugs took a shortcut.** Both runs stopped when the parse and load check failed, and reported every test failed, writing 12 and 20 lines instead of a full suite. That follows the crash clause but skips "a suite that checks every test". The high-effort runs wrote 560 and 593 lines for the same two bugs.
- **Patching a copy**: one run, on the index race, patched a copy of the code in its scratch folder to confirm its explanation. Its verdicts are about the unpatched code.

## Where the time went

| Median per run | Full suite, high | Full suite, medium |
| --- | --- | --- |
| Thinking | 197 s | 116 s |
| Writing the suite's code | 168 s | 138 s |
| Running the suite | 25 s | 17 s |
| Writing the final verdicts | 8 s | 9 s |
| Other calls | 14 s | 12 s |
| **Time per run** | 6.9 min | 5.2 min |

- **Thinking fell by 41%**, from 18.9k thinking tokens per run to 11.0k.
- **Writing the code fell by only 18%**, from 25.5k tokens to 21.6k. Leaving out the crash runs, suites were about the same size as at high effort: 566 to 1,267 lines.
- **Writing the suite is now the largest part**, 41% of all time. Lower effort barely shrinks it, because the suite still has to cover every test.

## Speed, tokens and cost

| | Full suite, high | Full suite, medium | Closed, extra high | Closed, high |
| --- | --- | --- | --- | --- |
| Real failures flagged, 11 non-crash bugs | 22 of 25 | 22 of 25 | 22 of 25 | 18 of 25 |
| Time per run, median | 6.9 min | 5.2 min | 3.2 min | 1.6 min |
| Batch wall time, 8 at a time | 18 min, in two waves | 12.3 min | 7.2 min | 3.9 min |
| Output tokens per run, median | 48k | 37k | 22k | 11k |
| Input tokens processed per run, median, cache reads included | 433k | 337k | 36k | 36k |
| Uncached input per run, median | 82k | 69k | 27k | 27k |
| Final context per run, median | 87k | 73k | 54k | 40k |
| Tool calls per run, median | 9 | 7 | 2 | 2 |
| Cost on the 5-minute cache, 15 runs | $21.06 | $15.84 | $8.58 | $5.37 |

- **Against closed extra high**: the same 22 real failures, for 1.6 times the time per run and 1.8 times the cost. The only thing a suite has added in these batches is the phantom-change bug, found once, at high effort.
- **Five-hour window**: it went from 33% before the batch to 56% after, about 23 points. The high-effort suite batch took about 31.

## Rule compliance

- **No rule flags.**
- **Isolation**: all 20 `node` runs set `HOME` inside scratch and `GIT_CEILING_DIRECTORIES`.
- **Your machine**: `~/.claude/settings.json` is unchanged since yesterday. Nothing appeared under `~/.claude/turn-diff` for the temporary workspaces, and no processes were left running.

## Caveats

- **One run per bug.** The match with high effort is exact here, but single tests have varied between runs before.
- **The crash shortcut is behavior, not a rule.** Both high-effort crash runs wrote full suites under the same instructions.

## Files

- Per-run logs: `logs/*-claude-r228-*` to `r242`. The suites are in `runs/r228/scratch` to `runs/r242/scratch`.
