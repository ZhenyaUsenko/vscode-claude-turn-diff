# Text tests

The extension's test suite rewritten as plain-language behavior statements, judged by a model instead of executed: first TypeSafe's Jev, then Claude. Nothing in here is part of the extension: `.vscodeignore` excludes it from the package and `npm test` does not touch it.

## Layout

| Path | What it is |
| --- | --- |
| `tests/` | The text tests and the background notes, shared by both judges. |
| `claude/` | The scripts that run the tests through Claude and analyze the results. |
| `lib/` | The shared code: paths, the test parser, the prompt builder, bugs, scoring and recording. |
| `reports/` | One report per Claude experiment, numbered in the order they ran. |
| `repro/` | `ghost-change.mjs`, a reproduction of a real bug the text tests found. Run it with `node --import ./test/setup.js jev/repro/ghost-change.mjs`. |
| `typesafe/` | Everything from the Jev experiments: scripts, their own `lib/`, probes, the TypeSafe docs and the wording notes. |
| `logs/` | One file per Jev request, and one Markdown log per Claude run. Gitignored. |
| `runs/` | One directory per Claude run, the real suite's results in `runs/real/`, and batch id lists. Gitignored. |

## Tests

| Path | What it is |
| --- | --- |
| `tests/behavior-tests.md` | The checks as statements of behavior: a short introduction and a list of terms, then one `# area` heading per test file and one `## name` heading per test, with the statement as plain text under it. |
| `tests/context-notes.md` | Background about Claude Code hooks and transcripts, VS Code and git, in Markdown. Describes the outside world only, never the extension. |
| `tests/scenario-tests.md` | The first phrasing, used only with Jev: one `# suite` per original test file, a `files:` line naming the source files the suite depends on, then `## test` entries with `scenario:`, `expected:` and an optional `notes:` line. Same ids as the behavior tests. |

## Judging the tests with Claude

Each test run is a fresh Claude session that receives short instructions and one command. The command writes a Markdown file holding the background notes, the full source under test and the tests; the session reads it and answers `pass <id>` or `fail <id>: <why>` for every test.

The instructions are agent definitions in `.claude/agents/`:

- `text-tests-closed.md`: may only run the command and read the file it writes.
- `text-tests-open.md`: may use any tool when reading is not enough, but must work only on its copy of the code and its scratch directory, must not read the real test suite or anything else in the repository, must run the code with `HOME` pointed at its scratch directory, and must keep git from reaching this repository with `GIT_CEILING_DIRECTORIES`.
- `text-tests-open-tools.md`: the open set, with tool use encouraged wherever it makes a verdict more correct or quicker to reach.
- `text-tests-open-suite.md`: the open set, required to write a test suite covering every test and give each verdict from its results.

| Path | What it is |
| --- | --- |
| `claude/build-prompt.mjs` | Writes the Markdown file a run reads: `tests/context-notes.md`, every source file with separator lines removed, and `tests/behavior-tests.md`. `--src <dir>` picks the code, `--out <file>` the output, `--group <name>` keeps only one group's tests. |
| `claude/run-real.mjs` | Runs the real test suite against clean code and against each bug, plus the load check, and saves which tests fail to `runs/real/<bug>.json`. When the load check fails, every test counts as failed. |
| `claude/make-run.mjs` | Creates `runs/rNN/` with a copy of `package.json`, `src` and `hooks` and applies the bug. `--approach closed|open --bugs clean,bug-a,... --groups all|a,b`. |
| `claude/run-cli.mjs` | Runs existing runs through headless Claude Code, with an agent definition's instructions as the whole system prompt, no user settings (so no CLAUDE.md, hooks or MCP servers), a bare environment and a working directory outside the repository. Closed runs get only `Bash` and `Read`, with `Bash` allowed only for the prompt command. Open runs get a temporary workspace holding a copy of the code, a scratch folder and the prompt file, and their scratch folder is copied back into `runs/`. `--model`, `--effort`, `--batch <label>`, `--agent <definition>` (default: the run's approach), `--concurrency`, `--stop-at <five-hour share>`, `--timeout-minutes`, `--cache-ttl` (default `5m`), `--fast`. It records each run as it finishes. |
| `claude/record-run.mjs` | Records a run by hand: finds its transcript, parses its answers, compares them with the real suite, checks its tool calls against the rules, and writes `runs/rNN.json` and a `logs/*-claude-*.md` rendering. `--run rNN --agent <agent id>` for a subagent, `--transcript` and `--stream` for a CLI session. |
| `claude/record-pending.mjs` | Waits for CLI sessions that outlived their runner, then records them. |
| `claude/report.mjs` | Prints the comparison tables over every recorded run, with medians per batch. Uncached input is the input not read from cache, cache writes included. Final context is the conversation's size at its last request, final answer included. |
| `claude/analyze-open.mjs [batch]` | Summarizes how each open run worked: tool calls, scripts written to its scratch directory and their length, whether it built a vscode stub, and how many tests it says it checked by running code. |
| `claude/analyze-time.mjs <batch>` | Splits each run of a batch into thinking, writing code, writing the final verdicts and tools running, from the timestamps in its transcript, with the output tokens of each. |
| `claude/analyze-speed.mjs` | Measures subagent start delays and output speed against how many ran at once. |
| `lib/bugs.mjs` | The bugs used in the experiments, each a set of exact search-and-replace edits applied to a copy of the code. |
| `lib/load-check.mjs`, `lib/vscode-stub.mjs` | The load check: every source file parses, the hook script passes `bash -n`, and the extension activates against the stub with `HOME` in a temporary folder, logging no errors and registering every command `package.json` declares. |
| `lib/stream.mjs`, `lib/transcript.mjs`, `lib/score.mjs`, `lib/record.mjs` | Read a CLI session's output stream and transcript, score the answers and check the rules, and record the run. |

### Running

```sh
node jev/claude/run-real.mjs
node jev/claude/make-run.mjs --approach closed --bugs clean,tree-order
node jev/claude/run-cli.mjs --runs r33,r34 --batch cli-high --effort high
node jev/claude/report.mjs
node jev/claude/analyze-time.mjs cli-high
```

## Reports

| Report | What it covers |
| --- | --- |
| `reports/01-subagents.md` | The first experiment: subagents at max effort, closed and open, the bugs, and how the open agents rebuilt a harness. |
| `reports/02-effort-and-fast-mode.md` | Closed runs at high effort through the CLI, and why fast mode could not run. |
| `reports/03-open-high-and-split.md` | Open runs at high effort, and closed runs split by test group, stopped halfway. |
| `reports/04-open-tools-encouraged.md` | Open runs encouraged to use tools. |
| `reports/05-closed-xhigh.md` | Closed runs at extra-high effort, and the comparison across effort levels. |
| `reports/06-fable.md` | Closed runs on Fable 5.1. |
| `reports/07-full-suite.md` | Open runs required to write and run a full test suite, and where their time went. |
| `reports/08-full-suite-medium.md` | The same at medium effort. |
| `reports/09-opus-4-6.md` | Closed runs on Opus 4.6. |

## Jev

| Path | What it is |
| --- | --- |
| `typesafe/run-tests.mjs` | Builds the state from the source files, with comment separators stripped, plus the chosen context, asks one Noul question per test and prints per-test probabilities. |
| `typesafe/compare.mjs` | Reads two labelled test runs from `logs/` and prints them side by side, sorted by how far each test moved. |
| `typesafe/spread.mjs` | Reads several labelled runs of the same request and prints each test's values, range and standard deviation, sorted by range, with a summary of how much identical requests move. |
| `typesafe/run-probe.mjs`, `typesafe/probes/` | Diagnostic questions around one test: the statement under test goes into the state as `statement`, and a probe module adds Noul, Choice and Score questions that split it into parts, check scope, and ask which part the code supports least. `--probe <name>` picks `probes/<name>.mjs`. |
| `typesafe/run-commits.mjs` | The git-history warm-up: classify a commit's diff blind, and tell its real message from a borrowed one. `--limit <n>` sends only the first n commits. |
| `typesafe/ask.mjs` | Sends one request from a JSON file, such as `smoke.json`, or lists models with `models`. |
| `typesafe/render-logs.mjs` | Re-renders existing logs to Markdown, all of them or the files named on the command line. |
| `typesafe/lib/client.mjs` | The only place requests are sent from. Writes every named request and its response to `logs/`, as JSON and as Markdown. The models listing is not logged. |
| `typesafe/lib/commits.mjs`, `typesafe/lib/questions.mjs`, `typesafe/lib/runs.mjs` | Build the commit requests, build probe questions, and read labelled runs back from `logs/`. |
| `lib/tests.mjs`, `lib/render.mjs` | Shared with the Claude runner: the test parser, the Jev request builder, and the Markdown rendering of a log entry. |
| `typesafe/wording-notes.md`, `typesafe/context-notes-log.md` | Every wording and context-notes attempt with its scores. |
| `typesafe/docs/` | The TypeSafe docs pages consulted, fetched as Markdown. |

### Running Jev

Every script reads `TYPESAFE_API_KEY` from the environment.

```sh
node jev/typesafe/run-tests.mjs --tests scenario-tests.md --label all-notes --files all --context notes
node jev/typesafe/run-tests.mjs --label behavior-1 --files all --context notes
node jev/typesafe/run-tests.mjs --label mutant-x --src <copy of the code> --files all --context notes
node jev/typesafe/compare.mjs all-notes mutant-x
node jev/typesafe/spread.mjs var-1 var-2 var-3 var-4 var-5
node jev/typesafe/run-probe.mjs --probe every_changed_file --label ecf-1
node jev/typesafe/run-tests.mjs --dry --files focused --context notes
node jev/typesafe/run-commits.mjs --limit 3
node jev/typesafe/ask.mjs jev/typesafe/smoke.json
```

`--tests` names a file in `tests/`, `behavior-tests.md` by default. `--files all` sends every source file in one request and points each question at its suite's files. `--relevant-files false` drops that `relevant_files` list from every question's instructions, so the question names no files at all. `--files focused` sends one request per suite holding only that suite's files. `--context` is `none`, `notes` for `tests/context-notes.md`, or `technical` for `TECHNICAL.md` verbatim. `compare.mjs` takes two labels and reads the latest logs carrying each.

### Jev results

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
