# Inline prompts, lean context and Codex fast mode

Three changes to the closed method, tested on clean code:

- **Inline prompt**: the whole test document is the prompt and the instructions are the system prompt, so the session needs no tools and answers in a single request.
- **Lean context**: cut what each CLI adds besides our own text.
- **Codex fast mode**: the fast service tier.

Each was checked on a cheap model first, GPT-6-Luna or Haiku 4.5, then on GPT-6-Astra at high effort.

What they show:

- **Both CLIs take the full document as the prompt.** It arrives byte for byte, and neither CLI has a limit anywhere near this size.
- **The lean settings cut Codex's overhead from about 13,900 tokens to about 330, and Claude Code's from about 4,900 to about 400.**
- **Inline is the fastest closed setup.** On the document without the rename note, Astra answered in 29 seconds in one request, against 36 for a 1:1 reproduction of the old setup, with 77% less input and about 2 window points against 3.
- **Fast mode works but doesn't pay on Astra.** It wrote about 1.3 times faster and used about 2.7 times the window, and the run still finished later.
- **The git rename note doubles the time and causes false alarms**, in either setup. With it, Astra reasoned 1,350 to 1,900 tokens instead of 150 to 300, took 72 to 80 seconds, and failed 1 to 3 move tests on clean code, citing the 50% threshold.

## Delivering a big prompt

- Both runners now send every prompt through stdin, so the command-line length limit doesn't apply.
- The 54,412-character document arrived unchanged in both CLIs' session logs.
- **Codex's** first request was 13,661 tokens: the document, our instructions and about 300 of Codex's own.
- **Claude Code's** was 16,574: the document, our instructions and about 400 of Claude Code's own. The tokenizers differ, so the same document counts differently.
- Asked about the document's last line, first and last test ids, and number of tests, Haiku answered all four correctly. Luna at low effort got both ids right, but quoted the last heading instead of the last line and miscounted the tests.

## What each CLI adds

**Codex**, on a one-line prompt:

| Setting | First request input |
| --- | --- |
| The runner's settings until now | 13,925 |
| Features that add tools or notes turned off: apps, plugins, goals, image generation, browser and computer use, memories and more | 8,915 |
| Permissions, environment, apps and collaboration-mode blocks turned off | 8,212 |
| Skills listing turned off, `skills.include_instructions=false` | 7,624 |
| Our instructions in place of Codex's own 18,000 characters, `model_instructions_file` | 4,108 |
| A model catalog copy without multi-agent, `model_catalog_json` | 2,196 |
| Shell tools turned off | 1,556 |
| The catalog copy also without code mode and `apply_patch` | 334 |

- **What's left** is the `request_user_input` tool.
- **Where the rest came from:**
  - A fresh Codex home installs six bundled skills and caches ChatGPT app tools, and lists them all in the context.
  - The multi-agent note ("4 available concurrency slots") comes from the catalog's `multi_agent_version: "v2"`, not from the `multi_agent` feature.
  - `tool_mode: "code_mode_only"` in the catalog is what keeps the exec-script tool.

**Claude Code:**

- The closed runs' `Bash` and `Read` definitions come to 4,910 tokens with a one-line system prompt.
- With no tools, the first request is 405 tokens.
- What remains are four things Claude Code adds even with `--system-prompt`: the working directory, the model's identity, a total-tokens reminder and the account email.
- With no Skill tool there is no skills listing.

## GPT-6-Astra, clean closed runs at high effort

The first inline runs reasoned several times more than any old closed run, so the old run r393 was reproduced 1:1: its exact prompt and Codex flags, and its document, rebuilt by temporarily reverting today's two document edits (the rename note and the dropped local path). The reproduction matched r393: 36 seconds against 40, 146 reasoning tokens against 292. Two more runs then crossed setup with document:

| Clean closed Astra, high | Old document | Today's document, with the rename note |
| --- | --- | --- |
| Old setup: command, reads, Codex's own context | r410: 36 s, 146 reasoning, 0 failures | r411: 72 s, 1,352 reasoning, 1 failure |
| Inline: document as the prompt, lean context | r412: 29 s, 291 reasoning, 0 failures | r408: 80 s, 1,910 reasoning, 2 failures |

- **The document, not the setup, made the difference.** With the rename note, both setups reasoned about 1,200 to 1,600 tokens more, took twice as long and failed move tests on clean code.
- **Every such failure cited the note**, for example "editing even one line of a short moved file can produce a deletion and an addition". The tests were `capture.move_is_one_change`, `capture.move_keeps_old_contents_as_before_image` and `view.move_renders_as_rename`.
- **Inline on the old document** was the fastest run: one request, 13.7k input against 58.4k, about 2 window points against 3.

The other runs on today's document:

| | Inline (r408) | Inline, Codex's instructions kept | Inline, fast (r409) |
| --- | --- | --- | --- |
| Input | 13.7k | 17.8k | 13.7k |
| Output (reasoning) | 2.6k (1.9k) | 2.1k (1.4k) | 3.7k (2.9k) |
| Time | 80 s | 67 s | 92 s |
| Output tokens a second | 32 | 31 | 41 |
| Codex five-hour window | 3 points | 3 points | 8 points |
| Failed on clean code | 2 | 3 | 10 |

Keeping Codex's own instructions made no clear difference.

## Fast mode

- **Setting it:** `-c service_tier="fast"` becomes the `priority` tier. Codex's catalog describes Astra's as "2x speed, increased usage" and Luna's as "1.5x speed".
- **Checking it:** the API's completion message reports `default` either way, so speed is the evidence. On the same long answer, Luna wrote 67 to 68 tokens a second on fast, against 33 to 49 on standard.
- **Astra:** 41 tokens a second against 32, about 1.3 times faster, for 8 window points against 3. It also reasoned more, so it finished later: 92 seconds against 80.
- **The fast run's 10 failures on clean code** are edge cases it chose to count, which one run can't tie to fast mode:
  - 3 from the rename note;
  - 3 from the real phantom-change bug that no real test covers;
  - 3 about two publishes in the same millisecond getting the same stamp;
  - 1 about foreign hooks sharing a hook group with the extension's.

## Follow-up: the rename note and the wording

Two changes were tried on the inline Astra setup with the note still in, each in one clean run with reasoning summaries on:

| GPT-6-Astra inline, clean code, with the rename note | Time | Reasoning | Failed |
| --- | --- | --- | --- |
| Baseline (r408): "had a line edited" | 80 s | 1,910 | 2 |
| `capture.move_is_one_change` saying "had a small part of it edited" (r413) | 45 s | 803 | 0 |
| "Judge the code, not the wording of the test." removed from the instructions (r414) | 61 s | 1,300 | 2 |

- **The wording fixed the false alarms.** The instruction sentence played no part: five of r414's seven reasoning headings were about the rename tests, such as "Weighing rename-test expectations".
- **Codex's reasoning is hidden.** It comes back only as `encrypted_content`. `model_reasoning_summary` adds summaries, which the runner now requests with `--summary`, but Astra's "detailed" summaries are headings only.

What changed as a result:

- `capture.move_is_one_change` now says "had a small part of it edited".
- "Judge the code, not the wording of the test." is gone from the inline, closed and suite instructions. The earlier open sets keep it as they ran.
- The rename note moved to `tests/context-notes-suite.md`, which only suite workspaces read. The shared notes are back to "Rename detection pairs a deleted path with an added path of similar contents."

Clean inline runs after the changes:

| | Time | Requests | Input | Output | Cost | Failed |
| --- | --- | --- | --- | --- | --- | --- |
| GPT-6-Astra, high (r415) | 28 s | 1 | 13.6k | 863 (271 reasoning) | 2 window points | 0 |
| Opus 5.5, extra high (r416) | 399 s | 1 | 22.0k | 44.3k | $1.00 | 0 |
| Opus 5.5, extra high, old closed runs (r183, r184) | 236 to 306 s | 3 | 35.6k | 28.3k to 35.0k | $0.70 to $0.84 | 0 |

With reasoning summaries on, a clean closed run (r432) and a clean inline run (r433) on the final document both passed everything. Closed took 41 seconds and 256 reasoning tokens, headed "Checking test outcomes" and "Running remaining tests". Inline took 33 seconds and 411 reasoning tokens, headed "Reviewing test edge cases" and "Checking test edge cases", twice.

Astra is back to its note-free speed. Opus reasoned more inline than in either old closed run, but the two old runs already differed by a quarter, so one run can't tell an effect of inline delivery from variation.

## Files

- `.claude/agents/text-tests-inline.md`: the inline instructions, for both CLIs.
- `claude/run-cli.mjs` and `codex/run-codex.mjs`: the `inline` approach, prompts through stdin, the lean Codex settings and `--fast`.
- `lib/prompt.mjs`: the document no longer names the code's local path.
- `lib/codex.mjs`: records the speed tier.
- Runs:
  - `r406`: the Luna check;
  - `r407`: the Haiku check, which passed all 59 tests;
  - `r408`: Astra inline;
  - `r409`: Astra inline on fast;
  - `r410`: the 1:1 reproduction of r393;
  - `r411`: the old setup on today's document;
  - `r412`: inline on the old document;
  - `r413` and `r414`: the wording and instruction experiments;
  - `r415` and `r416`: Astra and Opus after the changes;
  - `r432` and `r433`: closed and inline Astra with reasoning summaries.

  The run that kept Codex's instructions was a probe, not a recorded run. The reproduction used a scratch script replaying r393's launch, which isn't kept.
