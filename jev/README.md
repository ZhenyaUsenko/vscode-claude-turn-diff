# Jev experiments

Scratch work for trying TypeSafe's Jev model on this extension. Nothing in here is part of the extension: `.vscodeignore` excludes it from the package and `npm test` does not touch it.

## Layout

| Path | What it is |
| --- | --- |
| `tests.md` | The test suite as scenarios: one `# suite` per original test file, a `files:` line naming the source files the suite depends on, then `## test` entries with `scenario:`, `expected:` and an optional `notes:` line. It describes what each test does, step by step. |
| `behavior-tests.md` | The same 59 checks as statements of behavior, one `behavior:` line each, written the way a specification would put it rather than the way the test code does it. Same suites, files and ids, so runs of the two files compare test by test. |
| `context-notes.md` | Neutral background about Claude Code hooks, VS Code, git and the test harness. Sent as `state.context` with `--context notes`. |
| `run-tests.mjs` | Builds the state from the source files, with comment separators stripped, plus the chosen context, asks one Noul question per test in `tests.md` and prints per-test probabilities. |
| `compare.mjs` | Reads two labelled test runs from `logs/` and prints them side by side, sorted by how far each test moved. |
| `spread.mjs` | Reads several labelled runs of the same request and prints each test's values, range and standard deviation, sorted by range, with a summary of how much identical requests move. |
| `run-commits.mjs` | The git-history warm-up: classify a commit's diff blind, and tell its real message from a borrowed one. `--limit <n>` sends only the first n commits. |
| `ask.mjs` | Sends one request from a JSON file, or lists models with `models`. |
| `render-logs.mjs` | Re-renders existing logs to Markdown, all of them or the files named on the command line. |
| `lib/client.mjs` | The only place requests are sent from. Writes every named request and its response to `logs/`, as JSON and as Markdown. The models listing is not logged. |
| `lib/render.mjs` | Turns a log entry into Markdown. |
| `lib/tests.mjs`, `lib/commits.mjs` | Build the requests for the two experiments. |
| `lib/paths.mjs` | The directories the scripts share. |
| `logs/` | One entry per request, `MMDD-HHMMSS-<sequence>-<name>.json` in local time with the full request body and response, and a `.md` rendering beside it. Test runs are named `tests-<label>-<request>`, commit runs `commits-<hash>-<blind|verify>`. Gitignored. |
| `mutants/` | Repo copies with a bug reintroduced, for `--src`. Gitignored. |
| `docs/` | The TypeSafe docs pages consulted, fetched as Markdown. |

## Running

Every script reads `TYPESAFE_API_KEY` from the environment.

```sh
node jev/run-tests.mjs --label all-notes --files all --context notes
node jev/run-tests.mjs --tests behavior-tests.md --label behavior-1 --files all --context notes
node jev/run-tests.mjs --label mutant-x --src jev/mutants/x --files all --context notes
node jev/compare.mjs all-notes mutant-x
node jev/spread.mjs var-1 var-2 var-3 var-4 var-5
node jev/run-tests.mjs --dry --files focused --context notes
node jev/run-commits.mjs --limit 3
node jev/ask.mjs jev/smoke.json
```

`--files all` sends every source file in one request and points each question at its suite's files. `--files focused` sends one request per suite holding only that suite's files. `--context` is `none`, `notes` for `context-notes.md`, or `technical` for `TECHNICAL.md` verbatim. `compare.mjs` takes two labels and reads the latest logs carrying each.

## Results so far

These runs predate the log directory, so only their summaries survive here.

Git-history warm-up over 18 commits: the real commit message was told from a borrowed one 18 times out of 18, with a mean probability of 91% for the real message and 23% for the borrowed one. The blind kind classification agreed with my labels 11 times out of 18, mostly disagreeing where the commit was genuinely mixed.

Text tests against the correct source, 59 tests:

| config | pass at 50% | mean |
| --- | --- | --- |
| all files, no context | 52/59 | 69% |
| all files, notes | 52/59 | 71% |
| per-suite files, notes | 53/59 | 72% |
| all files, TECHNICAL.md | 57/59 | 76% |

Correct code scores 40 to 90%, so the useful signal is movement between runs, not pass/fail at 50%. `install.foreign_hooks_are_ignored` sits near 15% in every config although the real test passes. Stripping comment separators moved no test by 15 points or more. Sending the identical request twice moved one test by 15 points and five others by 4 to 11, so single runs carry that much jitter.

Mutant `no-agent-guard`, the `agent_id` early return in `endTurn` removed, fails exactly the subagent test in the real suite. Its matching text test dropped from 76% to 60%, the largest move of the run, while one unrelated test rose 15 points.
