# Running the text tests

Commands to run each method yourself, from the repository root. Every run is one fresh session, scored against the real test suite's result for the same bug. Records go to `jev/runs/rNN.json`, and a readable log of each run goes to `jev/logs/`.

## Before you start

- **Claude Code runner**: it starts `claude` from `CLAUDE_CODE_EXECPATH`, which is only set inside Claude Code. In your own terminal, point it at the binary the VS Code extension ships, once per shell:

  ```sh
  export CLAUDE_CODE_EXECPATH=$(ls -d ~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude | tail -1)
  ```

- **Codex runner**: it finds Codex inside the VS Code extension by itself and uses your Codex login.

- **Usage**: both runners stop launching new runs once the five-hour window passes `--stop-at`: 0.85 for Claude Code, 0.8 for Codex. Runs already started still finish.

## 1. Create the runs

`make-run.mjs` creates one run per condition: a copy of the code with the bug applied, in `jev/runs/rNN/`. It prints `=== rNN approach bug` for each run, so capture the ids:

```sh
BUGS=clean,clean,$(ls jev/bugs | sed -E 's/^[0-9]+-(.+)\.patch$/\1/' | paste -sd, -)
RUNS=$(node jev/claude/make-run.mjs --approach closed --bugs $BUGS | awk '/^===/ { print $2 }' | paste -sd, -)
echo $RUNS > jev/runs/batch-my-batch.txt
```

- **Bugs**: `$BUGS` above is the usual batch, two clean runs and every bug in `jev/bugs/`. Name bugs directly for a smaller one: `--bugs clean,tree-order,blob-offset`.

- **Method**: `--approach closed` or `--approach suite`.

- **Groups**: `--groups capture,server` or `--groups all` makes one run per test group for each bug, each seeing only its group's tests.

- **One set of runs per batch**: a run records the batch that ran it, so create a new set for each model or setting you compare.

## 2. Closed method

The session gets the whole test document as its prompt, has no tools, and answers in one request.

```sh
node jev/claude/run-cli.mjs --runs $RUNS --batch opus-closed-xhigh --effort xhigh
```

```sh
node jev/codex/run-codex.mjs --runs $RUNS --batch astra-closed-high --model gpt-6-astra --effort high
```

## 3. Suite method

The session gets a workspace with the code, a working VS Code stub and the tests, writes a test suite and runs it.

```sh
RUNS=$(node jev/claude/make-run.mjs --approach suite --bugs clean --groups capture,server | awk '/^===/ { print $2 }' | paste -sd, -)
node jev/codex/run-codex.mjs --runs $RUNS --batch luna-suite-high --model gpt-6-luna --effort high
```

```sh
node jev/claude/run-cli.mjs --runs $RUNS --batch opus-suite-high --effort high
```

To follow the sessions live, run this in a second terminal. It prints each tool call with the thinking time before it, failures, the agent's messages and each result:

```sh
node jev/claude/watch.mjs --runs $RUNS
```

## Options

- **Both runners**:

  - `--concurrency` sets how many run at once, 8 by default.

  - `--stop-at` sets the window share at which no more runs start.

  - `--timeout-minutes` sets when a run is stopped, 45 by default.

  - `--agent <name>` picks another instructions file from `.claude/agents/`.

- **Claude Code**:

  - `--model` is `claude-opus-5-5` by default.

  - `--effort` is `low`, `medium`, `high`, `xhigh` or `max`.

  - `--cache-ttl` is `5m` by default.

  - `--fast` needs usage credits.

- **Codex**:

  - `--model` is `gpt-6-luna` by default.

  - `--effort` is `low`, `medium`, `high`, `xhigh` or `max`.

  - `--fast` uses the priority tier, faster but heavier on the window.

  - `--summary detailed` records reasoning summaries, which on Astra are only headings.

## 4. Results

Each run prints a one-line result as it finishes. To compare batches, including every earlier one:

```sh
node jev/claude/report.mjs | less -S
```

To split a Claude Code batch's time into thinking, writing code, writing verdicts and running tools:

```sh
node jev/claude/analyze-time.mjs opus-suite-high
```

## 5. The real suite

Every run is scored against `jev/runs/real/<bug>.json`. After changing a bug or adding one, run the real suite for it:

```sh
node jev/claude/run-real.mjs blob-offset
```

With no names it runs clean code and every bug. `index-mtime` and `stamp-seconds` fail a varying number of real tests from run to run, so rerunning them can change the saved result that earlier batches were scored against.

## 6. Adding a bug

A bug is a patch in `jev/bugs/`, numbered in the order runs and reports list it, with a description paragraph above the diff.

```sh
WORK=$(mktemp -d)
mkdir $WORK/a && cp -R package.json src hooks $WORK/a/
cp -R $WORK/a $WORK/b
```

Edit the files under `$WORK/b`, then:

```sh
(cd $WORK && diff -ru a b) > jev/bugs/25-my-bug.patch
```

- **Description**: add one paragraph at the top of the patch, above the first `---` line.

- **Check**: create a run with `--bugs my-bug`. The patch is applied with no fuzz, so a patch that doesn't match the code fails there.

- **Keep only caught bugs**: run the real suite for it, and keep the bug only if some test fails.

## 7. What a run sees

The closed document for a run's code, or for the clean code of one group, printed to the terminal:

```sh
node jev/claude/build-prompt.mjs --src jev/runs/r417/code | less
```

```sh
node jev/claude/build-prompt.mjs --group capture | less
```

Whether a copy of the code parses and activates, which is what the crash rule is scored against. It prints nothing when the code loads, and the error when it doesn't:

```sh
node jev/lib/load-check.mjs jev/runs/r417/code
```

The Jev commands are in the README.
