# Text tests

The extension's test suite rewritten as plain-language behavior statements, judged by a model instead of executed: first TypeSafe's Jev, then Claude. Nothing in here is part of the extension: `.vscodeignore` excludes it from the package and `npm test` does not touch it.

## Layout

| Path | What it is |
| --- | --- |
| `tests/` | The text tests and the background notes, shared by both judges. |
| `claude/` | The scripts that run the tests through Claude and analyze the results. |
| `codex/` | `run-codex.mjs`, which runs the same tests through the Codex CLI. |
| `suite/` | What a suite run's workspace gets besides the code and tests: `vscode/`, a working stub of the VS Code API with helpers to drive and inspect it, packaged as the `vscode` module. It is copied to the workspace's `node_modules/vscode/`, so every `vscode` import there loads it without flags. The load check uses the same stub. |
| `bugs/` | The bug library: one patch per bug, numbered in the order runs and reports list them, with a one-paragraph description above the diff. |
| `lib/` | The shared code: paths, the test parser, the prompt builder, applying bugs, scoring and recording. |
| `reports/` | One report per Claude experiment, numbered in the order they ran. |
| `repro/` | `ghost-change.mjs`, a reproduction of a real bug the text tests found. Run it with `node --import ./test/setup.js jev/repro/ghost-change.mjs`. |
| `typesafe/` | Everything from the Jev experiments: scripts, their own `lib/`, probes, the TypeSafe docs and the wording notes. |
| `logs/` | One file per Jev request, and one Markdown log per Claude run. Gitignored. |
| `runs/` | One directory per run, the real suite's results in `runs/real/`, and batch id lists. A run keeps its session's logs and the document or workspace files it was given. A closed run's `code/` is removed once it is recorded, since its `prompt.md` holds the same source. An open or suite run keeps its `code/` and only the files its agent wrote in `scratch/`: test repositories, test `HOME` directories and files over 1 MB are left behind. Gitignored. |

## Tests

| Path | What it is |
| --- | --- |
| `tests/behavior-tests.md` | The checks as statements of behavior: a short introduction and a list of terms, then one `## Area` heading per test file. Each test is a `####` heading holding its id in backticks, the area and a short name, for example `Capture: A move is one change`, with its statement on the lines below. Agents reply with the same ids in backticks. The area is the real test file, whose checks follow the same order, which is how real results map onto the tests. |
| `tests/context-notes.md` | Background about Claude Code hooks and transcripts, VS Code and git, in Markdown. Describes the outside world only, never the extension. |
| `tests/context-notes-suite.md` | The same background for suite runs, plus git's 50% rename threshold, which test writers need to build a moved-and-edited fixture. Kept out of the shared notes because judges who only read the code took it as an exception to `capture.move_is_one_change`. |

## Judging the tests with Claude

Each test run is a fresh session, Claude Code or Codex, that answers `pass <id>` or `fail <id>: <why>` for every test. The prompt goes to the CLI through stdin. Two methods:

- **Closed**: the session gets the instructions as its system prompt and, as its prompt, one Markdown document holding the background notes, the full source under test and the tests. It has no tools and answers in one request.
- **Suite**: the runner prepares a workspace holding `tests.md` (the suite runs' background notes and the tests), `code/` (the extension), `node_modules/vscode/` (the stub from `suite/`) and an empty `scratch/`. The session reads everything, writes and runs a test suite, and gives each verdict from it. Nothing in the workspace points at this repository.

The instructions are agent definitions in `.claude/agents/`:

- `text-tests-closed.md`: the closed method, for both CLIs: judge the document the prompt holds, with no tools.
- `text-tests-open.md`: may use any tool when reading is not enough, but must work only on its copy of the code and its scratch directory, must not read the real test suite or anything else in the repository, must run the code with `HOME` pointed at its scratch directory, and must keep git from reaching this repository with `GIT_CEILING_DIRECTORIES`.
- `text-tests-open-tools.md`: the open set, with tool use encouraged wherever it makes a verdict more correct or quicker to reach.
- `text-tests-open-suite.md`: the open set, required to write a test suite covering every test and give each verdict from its results.
- `text-tests-open-suite-guided.md`: the same, plus guidance on driving a turn in order, avoiding hung test processes and fixing everything before rerunning.
- `text-tests-suite.md`: the suite method: the workspace, the stub's API and its one-window scope, how to drive a turn and keep test processes from hanging, and the rules, including a new `HOME` and new test repositories for every run, and what git needs in a test repository.
- `text-tests-suite-codex.md`: the suite method for Codex, which also gives the script that reads every file in one call.

The open sets were earlier experiments; the suite method replaces them.

| Path | What it is |
| --- | --- |
| `claude/build-prompt.mjs` | Writes the test document to a file: `tests/context-notes.md`, every source file with separator lines removed, and `tests/behavior-tests.md`. Closed runs get the same document as their prompt; open runs run this script as their command. `--src <dir>` picks the code, `--out <file>` the output, `--group <name>` keeps only one group's tests. |
| `claude/run-real.mjs` | Runs the real test suite against clean code and against each bug, plus the load check, and saves which tests fail to `runs/real/<bug>.json`. When the load check fails, every test counts as failed. |
| `claude/make-run.mjs` | Creates `runs/rNN/` with a copy of `package.json`, `src` and `hooks` and applies the bug. `--approach closed|open|suite --bugs clean,bug-a,... --groups all|a,b`. |
| `claude/run-cli.mjs` | Runs existing runs through headless Claude Code, with an agent definition's instructions as the whole system prompt, no user settings (so no CLAUDE.md, hooks or MCP servers), a bare environment and a working directory outside the repository. Closed runs get no tools and the document as their prompt, which leaves a few hundred tokens of Claude Code's own: a billing header, one SDK line, the environment and your account email (report 15). Open runs get a temporary workspace holding a copy of the code, a scratch folder and the prompt file, and the agent's own files from their scratch folder are copied back into `runs/`. `--model`, `--effort`, `--batch <label>`, `--agent <definition>` (default: the run's approach), `--concurrency`, `--stop-at <five-hour share>`, `--timeout-minutes`, `--cache-ttl` (default `5m`), `--fast`. It records each run as it finishes. |
| `claude/record-run.mjs` | Records a run by hand: finds its transcript, parses its answers, compares them with the real suite, checks its tool calls against the rules, and writes `runs/rNN.json` and a `logs/*-claude-*.md` rendering. `--run rNN --agent <agent id>` for a subagent, `--transcript` and `--stream` for a CLI session. |
| `claude/record-pending.mjs` | Waits for CLI sessions that outlived their runner, then records them. |
| `claude/report.mjs` | Prints the comparison tables over every recorded run, with medians per batch. Uncached input is the input not read from cache, cache writes included. Final context is the conversation's size at its last request, final answer included. |
| `claude/analyze-open.mjs [batch]` | Summarizes how each open run worked: tool calls, scripts written to its scratch directory and their length, whether it built a vscode stub, and how many tests it says it checked by running code. |
| `claude/analyze-time.mjs <batch>` | Splits each run of a batch into thinking, writing code, writing the final verdicts and tools running, from the timestamps in its transcript, with the output tokens of each. |
| `claude/analyze-speed.mjs` | Measures subagent start delays and output speed against how many ran at once. |
| `lib/bugs.mjs` | Lists the bugs in `bugs/` and applies one to a copy of the code with `patch -p1 --fuzz=0`, so a patch that no longer matches the code fails instead of landing somewhere else. A bug's name is its file name without the number, and its description is the paragraph above the diff. |
| `lib/load-check.mjs` | The load check: every source file parses, the hook script passes `bash -n`, and the extension activates against `suite/vscode/stub.mjs`, loaded for `vscode` imports by `lib/vscode-register.mjs`, with `HOME` in a temporary folder, logging no errors and registering every command `package.json` declares. |
| `lib/suite-workspace.mjs` | Prepares a suite run's workspace. |
| `claude/watch.mjs --runs <ids>` | Follows running sessions, Codex or Claude Code, and prints one line per notable event: each tool call with the thinking time before it, test failures, runs over 15 seconds, the agent's own messages, idle warnings and the recorded result. Built to feed Claude Code's Monitor tool. |
| `codex/run-codex.mjs` | Runs existing runs through `codex exec` with a temporary Codex home that links only your `auth.json` (so no `AGENTS.md`), the `workspace-write` sandbox with network on for open and suite runs, and the instructions file by approach, `text-tests-closed`, `text-tests-open` or `text-tests-suite-codex`, unless `--agent` names another: at the top of the prompt, or for closed runs in place of Codex's own instructions. Codex cuts tool output at 10k tokens twice: in the command tool, raised per call by the script in the Codex suite instructions, and again when the result is handed to the model, raised here by `-c tool_output_token_limit=25000`. The session log records the output before that second cut, so it can show more than the model saw. Closed runs are lean and read-only: our instructions replace Codex's own through `model_instructions_file`; a copy of the model catalog clears `multi_agent_version`, `tool_mode`, `apply_patch_tool_type` and `experimental_supported_tools`; `--disable` turns off the features that add tools or notes; and `-c` drops the skills listing and the permissions, environment, apps and collaboration-mode blocks. That leaves about 330 tokens besides the document, against about 13,900 with the defaults. `--fast` asks for the fast service tier, which on GPT-6-Astra costs about twice the window per token. `--summary detailed` records reasoning summaries in the session log; the reasoning itself only comes back encrypted, and Astra's summaries are headings. `--model`, `--effort`, `--batch`, `--agent`, `--concurrency`, `--stop-at` against the Codex five-hour window. |
| `lib/codex.mjs` | Turns a Codex session log and event stream into the same run record as a Claude run. |
| `lib/stream.mjs`, `lib/transcript.mjs`, `lib/score.mjs`, `lib/record.mjs` | Read a CLI session's output stream and transcript, score the answers and check the rules, and record the run. |
| `lib/run-files.mjs` | What a finished run keeps: the filter that copies back only the agent's own scratch files, and the removal of a closed run's `code/`. |

### Running

[commands.md](commands.md) has the commands for each method, from creating runs to reading the results, and for adding a bug.

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
| `reports/10-codex-astra.md` | Closed runs on GPT-6-Astra through Codex. |
| `reports/11-codex-luna.md` | Split full-suite pilots on GPT-6-Luna through Codex: the sandbox and harness traps, guided instructions, GPT-5.6-Luna, and a ready-made stub. |
| `reports/12-suite-workspace.md` | The suite method's prepared workspace, and the setup frictions found by watching three GPT-6-Luna pilots, with their fixes. |
| `reports/13-inline-and-lean.md` | The closed method with the document as the prompt and no tools, what each CLI adds to the context and how to cut it, and Codex fast mode, on GPT-6-Astra. |
| `reports/14-codex-context.md` | What Codex sends in its first request, captured from the wire and grouped: tools, its own instructions, skills, multi-agent notes and plugins, and what the lean settings leave. |
| `reports/15-claude-code-context.md` | What Claude Code sends in its first request in its defaults, the closed runs and the inline runs, captured from the wire and grouped. |
| `reports/16-inline-high.md` | The first full inline batch: Opus 5.5 at high effort, against the closed batches at high and extra-high effort. |
| `reports/17-bug-library.md` | The bug library as patches, 11 new bugs, and full closed batches on Opus 5.5 at extra high and GPT-6-Astra at high. |
| `reports/18-other-models.md` | Fable 5.0, Sonnet 5.5, 5.6 Sol, 6 Sol and 6.1 Sol on the closed method, the Sol models' fast tier, and full batches for Fable 5.0, Sonnet 5.5, 5.6 Sol and 6.1 Sol, the last on both tiers and at medium effort. |
| `reports/19-extra-failures.md` | Every extra failure and clean-run failure in report 18's batches: the bug, the statement, who flagged it, and whether it holds. |

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
node jev/typesafe/run-tests.mjs --label behavior-1 --context notes
node jev/typesafe/run-tests.mjs --label mutant-x --src <copy of the code> --context notes
node jev/typesafe/compare.mjs all-notes mutant-x
node jev/typesafe/spread.mjs var-1 var-2 var-3 var-4 var-5
node jev/typesafe/run-probe.mjs --probe every_changed_file --label ecf-1
node jev/typesafe/run-tests.mjs --dry --context notes
node jev/typesafe/run-commits.mjs --limit 3
node jev/typesafe/ask.mjs jev/typesafe/smoke.json
```

Every request sends all the source files and one question per behavior test. `--context` is `none`, `notes` for `tests/context-notes.md`, or `technical` for `TECHNICAL.md` verbatim. `compare.mjs` takes two labels and reads the latest logs carrying each.

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
