# Closed runs on GPT-6-Astra at high effort, through Codex

GPT-6-Astra caught all 13 bugs with no false alarm on clean code. Leaving out the two crash bugs, it flagged 22 of the 25 real failures, the same as Opus 5.5 at extra-high effort.

It did that in 0.8 minutes per run, with a median of 158 reasoning tokens and 1.2k output tokens per run. The price is the Codex usage window: the 15 runs took 56 points of the Plus plan's five-hour window, about 3.7 points each.

## How it ran

- **Harness**: `codex exec` from the Codex CLI bundled with the VS Code ChatGPT extension, run by `codex/run-codex.mjs`.
  - `-m gpt-6-astra -c model_reasoning_effort=high`.
  - A temporary Codex home whose only file from yours is a symlink to `auth.json`, so no `AGENTS.md`, skills or history. Your `auth.json` was not modified.
  - The `workspace-write` sandbox with network off.
  - A temporary workspace outside the repository.
- **Instructions**: the closed instructions, placed at the top of the prompt, since `codex exec` has no system-prompt option.
- **Rules**: Codex cannot remove tools, so "run the command and read the file, nothing else" is enforced only by the instructions and checked afterwards. Every run made 4 or 5 calls: the command, then reads of the prompt file.
- **Starting context**: Codex's own system prompt and tools come to about 14k tokens, against about 3k for the Claude CLI runs.

## Correctness

| Bug | Real suite | Opus 5.5, high | Opus 5.5, extra high | Opus 4.6, high | Fable 5.1, high | Astra, high |
| --- | --- | --- | --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | all pass, twice | all pass, twice | all pass, twice | all pass, twice |
| startup-rename | fails to load | caught | 59 of 59 | 59 of 59 | 59 of 59 | 59 of 59 |
| sync-await | crash | caught | 59 of 59 | 59 of 59 | 59 of 59 | 59 of 59 |
| binary-default | 8 | 7 of 8 | 7 of 8 | 6 of 8 | 7 of 8 | 7 of 8 |
| tree-order | 1 | 1 of 1, 1 extra | 1 of 1, 1 extra | 1 of 1 | missed | 1 of 1, 1 extra |
| index-mtime | 1 | caught | caught | missed | caught | caught |
| prompt-id | 1 | caught | caught | caught | caught | caught |
| interrupt-equality | 2 | 2 of 2 | 2 of 2 | 1 of 2 | 2 of 2 | 2 of 2 |
| advert-withdraw | 1 | caught | caught | caught | caught | caught |
| hook-cwd | 2 | 1 of 2 | 1 of 2 | 1 of 2 | 1 of 2 | 1 of 2 |
| stamp-seconds | 3 | 1 of 3 | 3 of 3 | 1 of 3 | 1 of 3 | 3 of 3 |
| empty-image | 2 | 2 of 2 | 2 of 2 | 2 of 2 | 2 of 2 | 2 of 2 |
| pure-rename-dropped | 3 | missed | 2 of 3 | missed | 1 of 3 | 2 of 3 |
| subagent-end | 1 | caught | caught | caught | caught | caught |
| **Real failures flagged, 11 non-crash bugs** | 25 | 18 | 22 | 15 | 18 | 22 |

- **Same verdicts as Opus 5.5 at extra high** on every bug, including all three stamp tests, two of the three move tests and the legitimate outside-files ordering extra.
- **Misses**: the two statement-bound tests every batch misses, and `capture.explorer_order` under pure-rename-dropped, which only max effort caught.

## Speed, tokens and usage

| | Opus 5.5, high | Opus 5.5, extra high | Astra, high |
| --- | --- | --- | --- |
| Real failures flagged, 11 non-crash bugs | 18 of 25 | 22 of 25 | 22 of 25 |
| Time per run, median | 1.6 min | 3.2 min | 0.8 min |
| Output tokens per run, median | 11k | 22k | 1.2k |
| Reasoning tokens per run, median | most of the output | most of the output | 158 |
| Uncached input per run, median | 27k | 27k | 20k |
| Final context per run, median | 40k | 54k | 31k |
| Cost | $5.37, 5-minute cache | $8.58 | not reported |
| Usage window | Claude five-hour window | Claude five-hour window | 56 points of the Codex Plus five-hour window, 9% of the weekly |

- **Almost no visible reasoning.** Astra's verdicts and one-sentence reasons came with a median of 158 reasoning tokens. It still found the git index race, the whole-second stamps and the dropped move.
- **The time matches the visible tokens.** Every run's final request, which reads nothing new and writes the verdicts, ran at 28 to 32 output tokens a second. That rate is the same in the two crash runs with no reasoning tokens as in runs with 300, so nothing suggests computation beyond the tokens it reports. Astra is simply slow per token: Luna writes about 45 a second and Opus 5.5 about 115.
- **Usage**: the Codex window read 4% before the first run and 60% a minute after the last. The GPT-6-Luna split pilot, with far more tokens, used about 2 points for 7 runs, so on this plan Astra weighs far more per token.

## Caveats

- **Reading**: Codex cuts command output longer than about 10k tokens from the middle. Every run's first `cat` of the prompt file showed lines 1 to 528 and 1064 to the end. Every run then read the missing middle with `sed` ranges, so every run saw every line of the file.
- **One rule flag**: in the dropped-rename run, Astra mistyped the temporary path in one `cat`, so the command read nothing. It then read the right file.
- **One run per bug**, as in every batch.
- **Different harness**: Codex's own system prompt and tools, not Claude Code's. The instructions are the same.

## Files

- `codex/run-codex.mjs`: the Codex runner.
- `lib/codex.mjs`: turns a Codex session log and event stream into the same run record as a Claude run, so scoring and `claude/report.mjs` work unchanged.
- Per-run logs: `logs/*-codex-r370-*` to `r384`.
