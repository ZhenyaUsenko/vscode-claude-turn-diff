# Effort and fast mode

At high effort, closed runs caught 12 of the 13 bugs with no false alarm on clean code. Each run was about six times faster than at max effort and used about six times fewer output tokens. The one miss, and a partial miss on a second bug, are both bugs where the failure only shows after following a condition through to its consequence, which max effort did every time.

Fast mode could not run. On a subscription plan it is paid from usage credits, never from the plan's limits, and usage credits are turned off on your account. Both fast-mode batches are waiting on that.

The first experiment's closed runs, at max effort as subagents, are the baseline in `01-subagents.md`.

## How the new batch ran

Each run was a headless Claude Code session instead of a subagent, started by `claude/run-cli.mjs`. That was needed for fast mode, which subagents can only inherit from the main session, and it gave the minimal context you asked for.

- **Command**: `claude -p` with `--model claude-opus-5-5` and `--effort high`.
- **Context**: the closed instructions as the whole system prompt, and a message holding only the command. No user settings are loaded, so there is no CLAUDE.md, no hooks and no MCP servers. The process gets a bare environment and a working directory outside the repository.
- **Tools, enforced by Claude Code itself**: only `Bash` and `Read` exist in the session, and `Bash` is allowed only for the `claude/build-prompt.mjs` command. Every run made exactly those two calls, with no permission denials.
- **Starting context**: about 3,100 tokens before the prompt file, against about 31,200 for a subagent, which carried the general-purpose system prompt, every tool's definition and your CLAUDE.md.
- **Batch**: the same 15 runs as the baseline, 2 clean and 13 bugs, 8 at a time.
- **Probe**: before the batch, one clean run at low effort passed all 60 tests in 48 seconds.

## Correctness

| Bug | Real suite | Max effort, subagent | High effort, CLI |
| --- | --- | --- | --- |
| clean, two runs each | all pass | all pass, twice | all pass, twice |
| startup-rename | 1 | caught 1 of 1 | caught 1 of 1 |
| sync-await | crash | 55 fail, 5 pass | 54 fail, 6 pass |
| binary-default | 8 | caught 7 of 8, 1 extra | caught 7 of 8 |
| tree-order | 1 | caught 1 of 1, 1 extra | caught 1 of 1, 1 extra |
| index-mtime | 1 | caught 1 of 1 | caught 1 of 1 |
| prompt-id | 1 | caught 1 of 1 | caught 1 of 1 |
| interrupt-equality | 2 | caught 2 of 2 | caught 2 of 2 |
| advert-withdraw | 1 | caught 1 of 1 | caught 1 of 1 |
| hook-cwd | 2 | caught 1 of 2 | caught 1 of 2 |
| stamp-seconds | 3 | caught 3 of 3 | caught 1 of 3 |
| empty-image | 2 | caught 2 of 2 | caught 2 of 2 |
| pure-rename-dropped | 3 | caught 3 of 3 | missed, 0 of 3 |
| subagent-end | 1 | caught 1 of 1 | caught 1 of 1 |

Where high effort fell short:

- **pure-rename-dropped, missed**: the bug removes the path comparison from the unchanged-file check, so a file moved without edits has equal contents and is dropped. High effort passed all three move tests. Max effort, in both approaches, traced that a move without edits has equal contents and named the dropped rename.
- **stamp-seconds, 1 of 3**: it caught the look-versus-end test, whose statement says "within the same second". It passed the two tests about two turns changing the same file, where two turns published in the same second get the same stamp, so the before-image address repeats and an old tab is served the new contents. Max effort caught both.
- **The binary extra went away**: max effort failed `capture.binary_skipped` by the statement's own definition of binary; high effort passed it. That extra was legitimate, so this is a small loss too.
- **Everything else matched max effort**: the same seven binary failures and the same legitimate outside-files ordering extra. Under the syntax error it kept the five install tests passing, as max effort did, and also the hook-script test, as the open run did.

## Speed and tokens

| | Max effort, subagent | High effort, CLI |
| --- | --- | --- |
| Bugs detected | 13 of 13 | 12 of 13 |
| Mean recall on bug runs | 95% | 82% |
| Time per run | median 9.1 min, 6.1 to 11.3 | median 1.6 min, 1.1 to 2.5 |
| Output tokens per run, median | 69k | 11k |
| Input tokens processed per run, median, cache reads included | 124k | 36k |
| Uncached input per run, median | 43k | 27k |
| Final context per run, median | 128k | 40k |
| Output tokens per second, median | 128 | 115 |
| Total over 15 runs | 136 agent-minutes, 1.04M output | 24 agent-minutes, 165k output |
| Cost Claude Code reported | not reported for subagents | $6.55, about $0.44 a run |
| Five-hour window | not measured | 5% before, 10% after |

Generation speed barely changed. High effort is faster because it thinks less: output, most of it thinking, fell from 69k to 11k per run. The five-hour figure comes from the rate-limit event in each run's output and includes this session's own use during the batch.

## Fast mode

- **How to run it**: `claude -p --settings '{"fastMode": true}'` turns it on for that one session. `claude/run-cli.mjs --fast` does exactly that. The CLI has no dedicated flag, and a subagent cannot turn it on for itself; it follows the main session.
- **Why it did not run**: every session's first message reported `fast_mode_state: off` with `fast_mode_disabled_reason: extra_usage_disabled`. The rate-limit event said `overageDisabledReason: org_level_disabled`. The documentation says that on Pro and Max, fast mode is available only through usage credits, which must be turned on, and draws from them even while plan usage remains.
- **What it would cost**: the $6.55 Claude Code reported for the high batch matches standard Opus 5.5 rates of $4 input and $20 output per million tokens, with one-hour cache pricing. Fast mode's published rates are $8 and $40, exactly double. At those rates:
  - The high batch would cost about $13 in usage credits.
  - A max batch would cost about $45 to $55. That estimate comes from the max-effort token counts, where output dominates.
  - Neither would touch the five-hour window.
- **What to expect from it**: the documentation promises output up to 2.5 times faster at the same quality, so a high-effort run might drop from 1.6 minutes to under a minute.

## CLAUDE.md

- **Subagents in the first experiment all read it.** Each received your global CLAUDE.md and the project one, about 19k characters, as an `instructions` attachment on its first message.
- **The CLI runs received none.** No user settings were loaded, and no `instructions` attachment appears in their transcripts.
- **Future subagent runs will skip it too.** Both agent definitions now set `omitClaudeMd: true`.

## Caveats

- **The high batch changed two things at once**: lower effort and much smaller context. A max-effort CLI batch would separate them. The misses look like effort, since they are reasoning gaps rather than missing information, but that is an inference.
- **One run per bug.** High effort might catch the rename bug on another try, and max effort might miss it.
- **The reported cost is notional on your plan.** The runs used the five-hour window, not money.

## Files

- **`claude/run-cli.mjs`**: runs a batch of existing runs through the CLI, with `--effort`, `--fast`, `--batch` and `--concurrency`.
- **`lib/stream.mjs`**: reads the session's output stream, taking fast-mode state, speed, cost and five-hour usage from it.
- **`lib/record.mjs`**: the recording step, now shared by `claude/record-run.mjs` and `claude/run-cli.mjs`.
- **`claude/report.mjs`**: now groups runs by batch.
- **Per-run logs**: `logs/*-claude-r33-*` to `r47`. Each run's CLI output stream and transcript are in `runs/`.
