# Other models on the closed method

Five more models judged the tests with the closed method at high effort: Fable 5.0 and Sonnet 5.5 through Claude Code, and 5.6 Sol, 6 Sol and 6.1 Sol through Codex. Each started with one clean run, and the three Sol models also ran on the fast tier. Four of them then ran the original 15 conditions: 2 clean runs and the 13 original bugs, and then the 11 newer bugs as well, Fable 5.0 in a later five-hour window.

## How it ran

- **Method**: closed. `text-tests-closed` is the instructions, the test document is the prompt, there are no tools, and each run is one request.

- **Document**: the current one, with readable test ids. The statements are the same as in report 17's batches; only the ids have changed since.

- **Claude Code**: `claude/run-cli.mjs` with the 5-minute cache. Fable 5.0 (`claude-fable-5`) ran 3 at a time on the original bugs to keep it from overshooting the five-hour window, and 6 at a time on the newer ones in a fresh window. Sonnet 5.5 (`claude-sonnet-5-5`) ran 8 at a time.

- **Codex**: `codex/run-codex.mjs` on Codex CLI 0.159.2, up from 0.155, 8 at a time. Every feature the lean closed settings disable still exists. The request grew by about 1k characters, all of it from our own changes: the readable ids and the reply format's code block.

## Clean runs and the fast tier

| High effort | Time | Output (reasoning) | Output speed | Failed on clean code | Cost |
| --- | --- | --- | --- | --- | --- |
| Fable 5.0 | 4.4 min | 22.2k | 84 tok/s | 0 | $1.39 |
| Sonnet 5.5 | 1.9 min | 16.3k | 140 tok/s | 0 | $0.22 |
| 5.6 Sol | 3.4 min | 9.7k (8.9k) | 47 tok/s | 0 | Codex window |
| 5.6 Sol, fast | 2.3 min | 9.8k (9.0k) | 70 tok/s | 0 | Codex window |
| 6 Sol | 2.6 min | 6.5k (5.7k) | 43 tok/s | 3 | Codex window |
| 6 Sol, fast | 0.7 min | 3.0k (2.2k) | 75 tok/s | 1 | Codex window |
| 6.1 Sol | 1.1 min | 1.7k (0.9k) | 25 tok/s | 0 | Codex window |
| 6.1 Sol, fast | 0.7 min | 1.9k (1.1k) | 44 tok/s | 0 | Codex window |

- **6 Sol** failed `Capture: A same-size edit is seen a second later` on both tiers, for the wrong reason: it said that keeping the index's old timestamp lets git skip the edit, when that timestamp is what makes git re-read the file. Its standard run also failed two statements that claim slightly more than the code does, the same two that show up in the half-batches below. It wasn't run further.

- **The fast tier** raised output speed 1.5 times on 5.6 Sol and about 1.75 times on 6 Sol and 6.1 Sol. Its cost in the Codex window couldn't be told here: the six runs went at once, and together they took the window from 0% to 11%. 6.1 Sol's full fast batch below measures it. Codex's model catalog marks fast as "increased usage" on 5.6 Sol and 6.1 Sol, but not on 6 Sol.

- **Caching** doesn't come into closed Codex runs. All of them, these included, report nothing read from the cache and nothing written to it, since each is a single request with a prompt prefix nobody else sends. Codex has no setting to turn caching off.

## Half-batches

Fable 5.0, Sonnet 5.5, 5.6 Sol and 6.1 Sol each ran 14 more runs, one clean and the 13 original bugs, which together with their clean run above makes 15. For comparison:

- Opus 5.5 at high effort is the inline batch from report 16.

- Opus 5.5 at extra-high and GPT-6-Astra at high are report 17's batches, counted on the same 13 bugs.

| Closed, high effort unless noted | Opus 5.5 | Opus 5.5, extra high | GPT-6-Astra | Fable 5.0 | Sonnet 5.5 | 5.6 Sol | 6.1 Sol |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bugs detected | 13 of 13 | 13 of 13 | 13 of 13 | 13 of 13 | 13 of 13 | 12 of 13 | 13 of 13 |
| Real failures flagged, 25 in the 11 bugs that don't crash | 19 | 23 | 22 | 19 | 19 | 20 | 22 |
| Extra failures | 0 | 0 | 1 | 1 | 1 | 7 | 2 |
| False alarms on clean code | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Median time per run | 1.5 min | 3.9 min | 0.5 min | 2.8 min | 1.6 min | 3.4 min | 1.2 min |
| Median output | 10k | 26k | 1k | 14k | 13k | 10k | 2k |
| Output speed | 111 tok/s | 111 tok/s | 30 tok/s | 88 tok/s | 144 tok/s | 47 tok/s | 25 tok/s |
| Cost of the batch | $4.67 | $16.97 for 26 runs | Codex window | $15.88 | $2.71 | Codex window | Codex window |

- **Where they differ** is the same two bugs as in every earlier batch:

  - **stamp-seconds**: 5.6 Sol and 6.1 Sol caught all three failures, like Opus at extra high and Astra. Fable 5.0, Sonnet 5.5 and Opus at high caught one.

  - **pure-rename-dropped**: 6.1 Sol caught two of three, Fable 5.0 and Sonnet 5.5 one. 5.6 Sol caught none, its only miss.

- **Everyone gets the same score on two tests.** Each model caught 7 of the 8 binary failures and 1 of the 2 hook-cwd failures. As before, those two misses come from statements narrower than their real tests and from the macOS `/private/var` symlink.

- **tree-order** was caught by all four. Fable 5.1 missed it in report 6.

- **Every extra failure is defensible.** Each points at a statement that claims slightly more than the code does:

  - `Workspace: Outside files come last, in tree order` under tree-order, flagged by Fable 5.0, Sonnet 5.5, 5.6 Sol and 6.1 Sol. Outside files use the same broken comparator, and the real test misses it only because its two files sit in sibling folders.

  - `Capture: Untracked files over one megabyte are ignored`, four times from 5.6 Sol. "Tracked files are included whatever their size" isn't quite true: a tracked before-image over 64 MiB overflows the output buffer of `git cat-file`.

  - `Capture: Every changed file is listed`, twice from 5.6 Sol. Once for that same buffer, and once because gitignored files inside a repository are never captured.

  - `Install: Other tools' hooks are ignored`, once from 6.1 Sol. Another tool's hook placed inside the same group as the extension's makes the group differ from what the extension registers.

## Full batches

All four then ran the 11 newer bugs too, which makes 26 runs each, the same conditions as report 17's batches. Fable 5.0's newer-bug runs waited for a fresh Claude five-hour window.

| Closed, all 24 bugs | Opus 5.5, extra high | GPT-6-Astra, high | Fable 5.0, high | Sonnet 5.5, high | 5.6 Sol, high | 6.1 Sol, high |
| --- | --- | --- | --- | --- | --- | --- |
| Bugs detected | 23 of 24 | 23 of 24 | 22 of 24 | 22 of 24 | 21 of 24 | 23 of 24 |
| Real failures flagged, 46 in the 22 bugs that don't crash | 42 | 41 | 37 | 36 | 38 | 41 |
| Of those, in the 11 newer bugs, out of 21 | 19 | 19 | 18 | 17 | 18 | 19 |
| Extra failures | 0 | 7 | 3 | 8 | 28 | 20 |
| False alarms on clean code | 0 | 0 | 0 | 0 | 0 | 0 |
| Median time per run | 3.9 min | 0.5 min | 2.9 min | 1.6 min | 3.3 min | 1.3 min |
| Cost of the batch | $16.97 | Codex window | $30.55 | $4.98 | Codex window | Codex window |

- **Missed bugs**:

  - `touch-copy-canonical`: every model, as in report 17. Its one real failure depends on the macOS `/private/var` symlink.

  - `hook-port-shortest`: Fable 5.0, Sonnet 5.5 and 5.6 Sol missed both failures. 6.1 Sol and Astra caught one, and Opus at extra high both.

- **blob-offset**: 6.1 Sol, 5.6 Sol, Fable 5.0 and Astra caught both failures, Sonnet 5.5 and Opus one.

- **Extra failures** are where the models differ most. None of them is wrong, and they come in three kinds:

  - **Consequences the fixtures don't reach.** Under `blob-offset`, before-images shift onto the wrong files, so the view tests on added, emptied and reverted files would fail too. Under `same-contents-unguarded`, opening a diff that has an added or deleted file throws, so nothing renders. Under `before-side-after-path`, a moved file's before-image can't be found. Fable 5.0, Sonnet 5.5, Astra and both Sol models flag these, 6.1 Sol 8 times; Opus at extra high flags none.

  - **Statements that claim slightly more than the code does**, flagged whatever the bug: the 64 MiB cap on tracked files, gitignored files, another tool's hook inside the extension's group, and, from 6.1 Sol, two publishes in the same millisecond sharing a stamp. 5.6 Sol raised these 14 times in its 11 newer-bug runs, 6.1 Sol 8 times, Fable 5.0 and Sonnet 5.5 never.

  - **A real bug in the code.** In its `touch-copy-canonical` run, 6.1 Sol failed two tests because naming an outside file that never gets created still publishes a diff: the phantom change reproduced in `repro/ghost-change.mjs`. That holds for the clean code too, though neither of its clean runs raised it.

## 6.1 Sol on the fast tier

6.1 Sol then ran a full batch on the fast tier too: its clean fast run from the first round plus 25 more, the same 26 conditions as its standard batch.

| 6.1 Sol, closed, high, all 24 bugs | Standard | Fast |
| --- | --- | --- |
| Bugs detected | 23 of 24 | 23 of 24 |
| Real failures flagged, 46 in the 22 bugs that don't crash | 41 | 40 |
| Extra failures | 20 | 10 |
| False alarms on clean code | 0 | 0 |
| Median time per run | 1.3 min | 0.7 min |
| Median reasoning tokens | 1,034 | 1,034 |
| Output speed | 23 tok/s | 46 tok/s |

- **Speed**: the fast tier doubled the output speed, as Codex's catalog promises for 6.1 Sol, and with the same reasoning it halved the time per run.

- **Verdicts**: almost the same. The fast batch missed one more binary failure, `View: Added, modified and deleted files get the right sides`. Otherwise both caught the same failures, and both missed only `touch-copy-canonical` outright.

- **Extra failures**: half as many, and all of them hold up. Eight are consequences, seven of them under `blob-offset`, where it found three that no other batch did. Two are the foreign hook inside the extension's group. It raised neither the 64 MiB cap nor the phantom change. Report 19 has the details.

- **Usage**: the batch ran alone in a fresh Codex window, which went from 0% to 42%, unchanged a minute later. That is about 1.7 points a run. The standard runs can't be measured on their own, because 6.1 Sol shared its window with 5.6 Sol, but the two together averaged about 1.1 points a run. The weekly window went from 22% to 28%.

## 6.1 Sol at medium effort

At high effort, 6.1 Sol's time and output looked like GPT-6-Astra's at extra high, so it also ran a full batch at medium effort, on the standard tier, to see whether its effort levels sit one step below Astra's.

| Closed, all 24 bugs | GPT-6-Astra, high | 6.1 Sol, medium | 6.1 Sol, high |
| --- | --- | --- | --- |
| Median time per run | 32 s | 32 s | 83 s |
| Median output | 1k | 1k | 2k |
| Output speed | 30 tok/s | 30 tok/s | 23 tok/s |
| Median reasoning tokens | 291 | 133 | 1,034 |
| Bugs detected | 23 of 24 | 22 of 24 | 23 of 24 |
| Real failures flagged, out of 46 | 41 | 38 | 41 |
| Extra failures | 7 | 7 | 20 |
| False alarms on clean code | 0 | 0 | 0 |

- **Time and output match Astra at high almost exactly**, down to the output speed. 6.1 Sol's own speed differs between efforts, 30 tokens a second at medium and 23 at high, so output speed isn't a fixed property of a model.

- **Reasoning and verdicts don't match.** 6.1 Sol at medium reasons half as much as Astra at high and misses more: all of `blob-offset`, which Astra and 6.1 Sol at high both caught, and one more binary failure. 6.1 Sol only matches Astra's verdicts at high, where it reasons three and a half times as much and takes two and a half times as long. So Astra gets the same verdicts from less reasoning, which fits a stronger model better than the same model with its effort levels shifted. With one batch each, the `blob-offset` miss could also be run-to-run variation.

- **Extra failures**: all seven hold up. Six are consequences, one of them new: under `same-contents-unguarded`, a diff with an added or deleted file throws while opening, so `Server: A turn ended through the hook opens its diff` fails too. The seventh is two publishes in the same millisecond sharing a stamp.

- **Usage**: the batch ran alone and took the Codex window from 42% to 54% settled, about 0.46 points a run, against about 1.7 for the high-effort fast batch. The weekly window went from 28% to 30%.

## Usage

- **Claude five-hour window**: 9% before, 53% settled afterwards. Fable 5.0 and Sonnet 5.5 ran together, $18.59 between them, alongside this session. That is about 2.4 points per dollar, in line with Opus 5.5, while Fable 5.1 used about 3.9 in report 6. Going by the reported costs, Fable 5.0 is priced like Fable 5.1, at $10 and $50 per million input and output tokens, and Sonnet 5.5 at $2 and $10, half of Opus 5.5.

- **Codex five-hour window**: 11% before, 43% settled afterwards, for both Sol batches together, 28 runs. That is about 1.1 points a run. 5.6 Sol and 6.1 Sol ran at the same time, so they can't be told apart. The weekly window went from 13% to 18%.

- **The newer bugs**: Sonnet 5.5's 11 runs cost $2.27, and the Claude window read 55% at the last of them. The two Sol models' 22 runs took the Codex window from 43% to 53% at the last reading, which may still have been catching up.

- **Fable 5.0's newer bugs**, in a fresh Claude window: its 11 runs cost $14.67 and took the window from 7% to 63% settled. That is about 3.7 points per dollar, close to Fable 5.1's 3.9 and well above the 2.4 measured in the earlier window, where Fable shared the window with Sonnet. Both readings count everything on the account, including any other Claude session, so neither is a clean measure of Fable alone.

## Takeaways

- **6.1 Sol** flags what Astra does: 22 of 25 on the original bugs, and 41 of 46 on all 24, one short of Opus 5.5 at extra high. It reasons little, like Astra, and takes about twice as long, 1.3 minutes a run. It raises more extra failures than any model but 5.6 Sol, all of them defensible.

- **Sonnet 5.5** flags exactly what Opus 5.5 does at high effort on the original bugs, in about the same time, for 58% of the cost. On all 24 it is the cheapest full batch so far, $4.98, but it missed `hook-port-shortest` outright and flags 36 of 46.

- **Fable 5.0** also matches Opus 5.5 at high effort on the original bugs, for 3.4 times the cost and nearly twice the time. On all 24 it flags 37 of 46, one more than Sonnet 5.5, for six times the cost, and misses the same `hook-port-shortest`.

- **5.6 Sol** is the slowest, raises the most extra failures, 28, and missed three of the 24 bugs.

- **6.1 Sol at medium effort** matches Astra at high effort in time and output, 32 seconds a run, for about 0.46 points of the Codex window, but catches 38 of 46 to Astra's 41 and missed `blob-offset`.

- **6.1 Sol on the fast tier** gives the same verdicts in half the time, 0.7 minutes a run, with half the extra failures, for about 1.7 points of the Codex window a run.

- **6 Sol** had a wrong failure on clean code on both tiers, the only model here that did.

## Files

- Clean runs `r488` to `r495`, logged in `runs/model-survey-2026-10-01.log`.

- Half-batch runs `r496` to `r551`, logged in `runs/half-batches-2026-10-01.log`, with their ids in `runs/batch-*-closed-high-half.txt`.

- Newer-bug runs `r552` to `r584`, logged in `runs/rest-batches-2026-10-01.log`, and Fable 5.0's `r586` to `r596`, logged in `runs/fable5-rest-2026-10-01.log`, with their ids in `runs/batch-*-closed-high-rest.txt`.

- 6.1 Sol's fast batch, `r597` to `r621`, logged in `runs/sol61-fast-2026-10-01.log`, with their ids in `runs/batch-sol61-fast-closed-high.txt`.

- 6.1 Sol at medium, `r622` to `r647`, batch `codex-sol61-closed-medium`, logged in `runs/sol61-medium-2026-10-01.log`, with their ids in `runs/batch-sol61-closed-medium.txt`.

- Batches `cli-fable5-closed-high`, `cli-sonnet55-closed-high`, `codex-sol56-closed-high` and `codex-sol61-closed-high`, each with its clean run from the first round. The 6 Sol runs and the fast runs are `codex-sol6-closed-high`, `codex-sol6-closed-high-fast`, `codex-sol56-closed-high-fast` and `codex-sol61-closed-high-fast`.
