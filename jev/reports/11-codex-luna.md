# Full-suite runs on GPT-6-Luna through Codex, split by test group

These were pilots for a split batch: GPT-6-Luna at high effort, open approach, told to write and run a full test suite, one agent per test group. Only clean code was run, so they say nothing about detection. The full batch was not run.

What they show:

- **Two harness problems specific to Codex.** Its sandbox blocks localhost, and it cuts tool output twice, once on the way to the model.
- **Where the time goes.** A few groups took far longer than the rest because the agent had to debug its own way of driving the extension through a turn. Three short paragraphs of guidance roughly halved them.
- **Models.** GPT-5.6-Luna is no faster than GPT-6-Luna on this work.
- **A ready-made stub.** Giving the agent the repository's VS Code stub saved no time.

## How it ran

- **Harness**: `codex/run-codex.mjs`, running `codex exec` with:
  - a temporary Codex home that links only your `auth.json`, so there is no `AGENTS.md`, skills or history;
  - the `workspace-write` sandbox;
  - a temporary workspace outside the repository.
- **Instructions**: `text-tests-open-suite`, the same as the Opus suite runs, placed at the top of the prompt.
- **Split**: seven agents per condition, one per group, each seeing the full source but only its group's tests.
- **Usage**: small. Each seven-run pilot used about 2 points of the Plus plan's five-hour window, and the later pairs used under 1.

## Pilots

| Group | Pilot 1, network off | Pilot 2, network on |
| --- | --- | --- |
| install | 2.1 min | 1.9 min |
| view | 2.6 min | 2.7 min |
| retention | 2.8 min | 4.1 min |
| workspace | 4.0 min | 2.7 min |
| running | 6.0 min | 3.5 min |
| capture | 4.5 min | 10.2 min |
| server | 9.1 min | 11.7 min |

- **Every group checked all its tests by running them.**
- **Clean-code verdicts**:
  - Pilot 1 had one false alarm, `capture.move_is_one_change`. The agent's test file was probably small enough that one edited line pushed it under git's rename threshold.
  - Pilot 2 had none.
- **A split pays only when groups take similar time.** Here the slowest group sets each condition's time, about 10 to 12 minutes, while most groups finish in 2 to 4.
- **The same group varies a lot between identical runs**: capture took 4.5 minutes in one pilot and 10.2 in the next.

## What made capture and server slow

Almost all the time was the model thinking and writing. Running code took 1 to 74 seconds per group.

- **Sandbox network** (server, pilot 1): `workspace-write` blocks network access, including localhost. The extension's server could not listen and the hook script could not reach it. The agent spent about 6.5 of its 9 minutes on this, then faked the server's protocol, so its verdicts did not come from real connections.
  - `-c sandbox_workspace_write.network_access=true` fixes it. The runner now sets it for open runs only.
- **Turn order** (capture, pilot 2): the agent's helper made its file edits before starting the turn. The baseline snapshot, taken at the start of a turn, already held the edits, so every published diff was empty. Finding that took about 6.5 minutes and eleven patch-and-rerun rounds.
- **A deadlock** (server, pilot 2): the suite ran the hook script with `spawnSync` while the extension's server ran in the same process. A synchronous child blocks the event loop, so the server could not answer and every run hung until a timeout. About 150 seconds went to waiting and polling.
- **Round trips**: each small fix-and-rerun costs 4 to 7 seconds of latency before any thinking. At 34 to 51 requests per run, that alone is several minutes.

## Guided instructions

`text-tests-open-suite-guided` adds three short paragraphs to the suite instructions without describing the code's behavior:

- trace one complete turn through the code before writing the suite, and drive every test in that order;
- start any child process that talks to an in-process server asynchronously, and make every test finish on its own;
- find a failure's cause in the code, and fix everything found, before rerunning.

| Group | Pilot 1 | Pilot 2 | Guided |
| --- | --- | --- | --- |
| capture: time | 4.5 min | 10.2 min | 4.0 min |
| capture: requests / suite runs | 19 / 9 | 35 / 13 | 12 / 4 |
| server: time | 9.1 min | 11.7 min | 4.5 min |
| server: requests / suite runs | 51 / 27 | 34 / 11 | 8 / 2 |

The capture agent wrote down the turn sequence before building anything: "`begin` runs on `UserPromptSubmit`; the first `arm` on `PreToolUse` snapshots the baseline; the editing tool changes files after that `arm`". The server agent wrote its whole harness at once and never hung. Both passed everything on clean code.

## GPT-5.6-Luna

- **Same prompt, no tools, two runs each**: both models produced about 50 output tokens a second.
- **On the guided runs**: both wrote at 42 to 44 tokens a second.
  - GPT-5.6-Luna reasoned about twice as much.
  - It took 5.4 minutes on capture and 8.9 on server, against 4.0 and 4.5.
  - Its server run wrote a 455-line first draft, against 276, then spent several rounds on activation and hook paths.

GPT-6-Luna is the better fit for this work.

## A ready-made VS Code stub

`run-codex.mjs --stub` copies `test/utils/vscode-stub.js` and its loader hook into the agent's scratch directory, with a note saying how to use them. That stub has no `window`, `commands.registerCommand` or `workspace.onDidChangeWorkspaceFolders`, because the real suite never activates the extension, so the note says to add them if needed.

| Guided run | Time | Requests | Output | Own code |
| --- | --- | --- | --- | --- |
| capture, no stub | 4.0 min | 12 | 10.3k | 283 lines |
| capture, stub | 5.6 min | 15 | 10.9k | 178 lines |
| server, no stub | 4.5 min | 8 | 11.4k | 275 lines |
| server, stub | 5.5 min | 17 | 12.1k | 194 lines |

The stub removed about 100 lines of writing, but both agents spent that saving reading the stub and adding the missing members, and their fix rounds did not change. The stub was not where the time goes. What remains is understanding the code before the first write, about 1.5 to 3 minutes, and the fix rounds.

## Reading the prompt file

Codex cuts tool output at 10,000 tokens twice:

1. in the command tool, raised per call with `// @exec: {"max_output_tokens": 25000}` and `max_output_tokens: 25000`;
2. when the result is handed to the model, raised with `-c tool_output_token_limit=25000`.

The session log records output before the second cut, so it can show more than the model saw. The runner now applies both, and its note gives the exact script. With both in place, a GPT-6-Astra closed run read the whole file in one call and needed three requests instead of five or six.

## Files

- `codex/run-codex.mjs`: `--stub`, network for open runs, the reading note and both output limits.
- `.claude/agents/text-tests-open-suite-guided.md`: the guided instructions.
- Runs:
  - `r258` to `r264` and `r363` to `r369`: the two pilots;
  - `r394` to `r399`: the guided, GPT-5.6-Luna and stub pairs;
  - `r265` to `r362`: created for the full batch but never run.
