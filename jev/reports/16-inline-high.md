# Inline runs on Opus 5.5 at high effort

The first full batch of the inline method: the same 15 conditions as every closed batch, 2 clean and 13 bugs, each judged in a single request with no tools.

## How it ran

- **Harness**: `claude/run-cli.mjs`, Opus 5.5 at high effort, 8 at a time, the 5-minute cache.
- **Instructions**: `text-tests-inline` as the system prompt, without the "Judge the code, not the wording of the test." sentence.
- **Prompt**: the test document itself: the shared background notes, the source and the tests.
  - The notes no longer include git's rename threshold.
  - `capture.move_is_one_change` now says "had a small part of it edited".
- **Tools**: none.

## Results

| | Closed, high | Inline, high | Closed, extra high |
| --- | --- | --- | --- |
| Bugs detected | 12 of 13 | 13 of 13 | 13 of 13 |
| Real failures flagged, 25 in the 11 bugs that don't crash | 18 | 19 | 22 |
| False alarms on clean code | 0 | 0 | 0 |
| Extra failures | 1 | 0 | 1 |
| Requests per run | 3 | 1 | 3 |
| Median time per run | 1.6 min | 1.5 min | 3.2 min |
| Median output | 11k | 10k | 22k |
| Median input | 36k | 22k | 36k |
| Median final context | 40k | 32k | 54k |
| Cost for 15 runs, 5-minute cache | $5.37 | $4.67 | $8.58 |

- **Detection:** inline caught one of the three dropped-rename failures, which the closed high batch missed entirely. Everything else matched the closed high batch:
  - one of the three whole-second stamp failures;
  - seven of the eight binary failures;
  - one of the two hook failures.
- **Extras:** the closed batches also flagged the outside-files ordering failure, which the test's wording supports; inline didn't.
- **Crash bugs:** both answered in half a minute, with all 59 tests failed.
- **Cost:** about 13% below the closed high batch, from 39% less input with about the same output.
- **Five-hour window:** readings went from 9% to 15% over the batch, about 5 points for the batch itself, as the closed high batch took.

These are single batches, and at high effort the stamp and rename bugs have scored differently between batches before, so the one-failure edge in detection is within that variation. The steadier gains are one request instead of three, no tools, and less input.

**Caching:** each run writes its whole prompt, about 22k tokens, to the cache and never reads it back, so the cache-write premium, about 7% of the batch cost, buys nothing. It can't be turned off, though. Claude Code 2.1.283 honors `DISABLE_PROMPT_CACHING` only when its endpoint isn't Anthropic's own. Through a local proxy, a request with the switch on carried no cache markers and nothing was cached. Against Anthropic's endpoint, with or without an explicit `ANTHROPIC_BASE_URL`, 16k tokens were still written to the cache. Codex has nothing to turn off: OpenAI's caching carries no write premium.

## Files

- Runs `r417` to `r431`, batch `cli-inline-high`.
- `claude/report.mjs` lists the batch next to the closed high batch.
