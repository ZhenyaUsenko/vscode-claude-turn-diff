# A bigger bug library, on the closed method

Two changes, then two full batches:

- **The closed method is now the inline one.** The session gets the test document as its prompt and the instructions as its system prompt, with no tools, in one request. The command-and-read version is gone.
- **The bug library is a folder of patches.** Each bug in `jev/bugs/` is a unified diff with a paragraph describing it, applied with `patch --fuzz=0` instead of search-and-replace strings inside a script. The 13 bugs so far were converted exactly, and 11 new ones were added.

The batches were Opus 5.5 at extra-high effort and GPT-6-Astra at high effort, each on 2 clean runs and all 24 bugs.

## The new bugs

| Bug | Where | What goes wrong | Real tests that fail |
| --- | --- | --- | --- |
| blob-offset | `utils/git.js` | the `cat-file --batch` parser skips a blob's contents but not the newline after them, so later before-images land on the wrong files | 2: every changed file, binary skipped |
| pause-turn-ends | `store/transcript.js` | `pause_turn` counts as the end of a turn | 1: a paused turn is still running |
| same-contents-unguarded | `utils/files.js` | dropping the size check also drops what kept it from reading a missing file, so rendering a created file throws | 3 view tests |
| before-side-after-path | `view.js` | the before side is put on the after path, so a move shows no rename and its before-image is looked up under the new path | 1: a move renders as a rename |
| session-id-file | `turn/index.js` | the prompt id is read where the session id belongs, so a turn that is asked for never finds its transcript | 3: interrupted and never-stopped turns |
| hook-port-shortest | `hooks/turn-diff.sh` | `${port%%[!0-9]*}` becomes `${port%[!0-9]*}`, so the port keeps the rest of the advert and the hook never connects | 2: both tests through the hook |
| foreign-groups-compared | `install/settings.js` | the registration check compares every hook group on an event, including other tools\' | 1: foreign hooks are ignored |
| empty-turn-publishes | `turn/index.js` | a turn that changed nothing still publishes, replacing the previous diff | 3 |
| look-disarms | `turn/index.js` | a look disarms the running turn, so the rest of it goes uncaptured | 3 |
| touch-copy-canonical | `turn/capture.js` | the copy of an outside file is stored under its canonical path but read back under the path the tool named, so behind a symlink the before-image is lost | 1: an outside binary is skipped |
| watch-twice | `utils/watch.js` | an outside file already watched gets another watcher | 1: watched once |

- **Two candidates were dropped** because the real suite doesn't catch them:
  - natural-order: the collator without numeric sorting. The explorer-order test has no numbered names.
  - stale-touch-list: the touch list surviving disarming. No test runs a turn after one that touched an outside file.
- **touch-copy-canonical depends on the machine.** Its real failure shows only because macOS temp folders sit behind a symlink. The failing test's binary file has its zero byte only in its before contents, so skipping it depends on the lost copy.
- **Stability:** each new bug's real failures were identical over two runs of the real suite.

## Results

| | Opus 5.5, extra high | GPT-6-Astra, high |
| --- | --- | --- |
| Bugs detected | 23 of 24 | 23 of 24 |
| Real failures flagged, old 13 bugs (25 in the 11 that don't crash) | 23 | 22 |
| Real failures flagged, new 11 bugs (21) | 19 | 19 |
| Extra failures | 0 | 7 |
| False alarms on clean code | 0 | 0 |
| Median time per run | 3.9 min | 0.5 min |
| Median output | 26k | 1k |
| Median input | 22k | 14k |
| Cost | $16.97 for 26 runs | about 35 points of the Codex five-hour window |
| Five-hour window | 10% to 29% | 4% to 39% |

- **Both missed touch-copy-canonical.** Neither noticed that the path a tool names and its canonical form differ behind a symlink.
- **Each model missed one other failure:**
  - Opus flagged one of blob-offset\'s two failures;
  - Astra flagged one of hook-port-shortest\'s two, though it said the connection never opens.
- **Astra\'s seven extras** are consequences of the bugs that the real fixtures don\'t hit:
  - same-contents-unguarded: four capture tests. Their files never reach the diff because rendering throws.
  - blob-offset: two view tests. An added file sorted after a real blob would get a spurious empty before-image.
  - tree-order: the outside-files ordering failure every batch flags.

  Opus raised none, not even the ordering one it raised in its earlier closed batch.
- **Against the earlier closed batches on the old 13 bugs:**
  - Opus flagged 23 against 22, catching all three dropped-rename failures;
  - Astra flagged 22 again.
- **Opus spent longest on clean code:** its two clean runs took 6.7 and 7.8 minutes, with 43k to 44k output tokens and about $1 each, against a 3.9-minute median. With nothing to find, it keeps looking.

## Files

- `jev/bugs/`: the 24 patches, numbered in run and report order.
- `lib/bugs.mjs`: lists and applies them.
- Runs:
  - `r434` to `r459`: batch `codex-astra-closed-high-24`;
  - `r460` to `r485`: batch `cli-closed-xhigh-24`.

  Their id lists and runner logs are in `runs/`.
