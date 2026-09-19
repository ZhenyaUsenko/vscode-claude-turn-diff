# Context notes log

Every change tried on `context-notes.md`, the file sent to Jev as `state.context` with `--context notes`, while `behavior-tests.md` stayed frozen at its `w-final` wording. Scores are Jev's Noul answers in percent from `node jev/run-tests.mjs --tests behavior-tests.md --files all --context notes`. The baseline is the pair `w-final-1` and `w-final-2` (mean 80%, 59/59 passing), whose two identical runs differ by a median of 2 points per test and at most 9. A change was kept when it lifted the tests it targets by 10 points or more with a confirming run, or 15 in one run, without dropping others; otherwise it was reverted. Each variant was applied on top of the base in force at the time and measured on its own.

The hard rule for the file: it describes the outside world only, Claude Code, VS Code, git and the runtime, never this extension or its tests.

## What the notes are worth at all

`c-00-none-1` and `c-00-none-2` ran the same statements with `--context none`: mean 79% and 79%, 59/59 passing, against 80% and 80% with the notes. Per test, the notes are worth 10 to 16 points to `running.running_turn_is_brought_up_to_date`, `view.move_renders_as_rename`, `workspace.outside_binary_is_skipped`, `server.hook_keys_by_transcript_not_cwd`, `capture.untracked_over_size_cap` and `view.a_m_d_become_the_right_sides`, and they cost 8 to 13 points on `install.empty_settings_are_not`, `retention.later_turn_replaces_before_images` and `capture.same_size_edit_a_second_later`. Net about +1.2 points on the mean.

## Removals

### test_harness section removed — kept (`c-01-no-harness`)

Removed the whole `# test_harness` section, which described this project's test fixtures and so broke the hard rule. Mean unchanged at 80%, 59/59. `retention.new_prompt_discards_abandoned_turn` rose from 68 to 80, and stayed at 75 to 80 in every one of the following eleven harness-free runs against 66 to 69 in the two baseline runs, so the removal is worth a confirmed +10 there. `workspace.outside_binary_is_skipped` rose 65 to 78 in this run but proved volatile afterwards (63 to 78 across later runs). `retention.advert_survives_a_turn` fell 83 to 71 in this run and later swung between 65 and 85 with no change aimed at it, so it is treated as unstable rather than as a signal. This is the base for everything below.

### claude_code section removed — reverted (`c-02-no-claude`)

Mean 80%, 58/59. `workspace.outside_binary_is_skipped` fell 78 to 51 and `retention.later_turn_replaces_before_images` rose 77 to 88. The section carries the outside-file tests, most likely through the sentence that Edit and Write carry `tool_input.file_path`.

### vscode section removed — reverted (`c-03-no-vscode`)

Mean 79%, 59/59. `view.move_renders_as_rename` fell 83 to 68 (84 to 68 against the baseline pair), `view.reverted_by_hand_drops_out` fell 76 to 64, and `workspace.outside_file_created_has_no_before_image` fell 77 to 63 against the baseline pair. The rename-inference and FileNotFound sentences earn their place.

### git section removed — reverted (`c-04-no-git`)

Mean 80%, 59/59, mean delta 0.0 against the base. No test moved 10 points; `capture.untracked_over_size_cap` and `capture.move_keeps_old_contents_as_before_image` each lost 6. The section is worth little on its own, and stays because the no-context runs show the git-dependent tests losing more when everything goes.

## Additions, each measured on its own from the no-harness base

### git: what cat-file prints for an empty blob — not kept (`c-05-add-git-empty-blob`, `c-06-add-git-empty-blob-2`)

Added to the git section: "For an empty blob the header is "<hash> blob 0" and the body is empty, so the header's newline is followed directly by the newline that ends the record." Targets `capture.empty_file_deleted` and `view.emptied_and_deleted_empty_both_render`. Two runs: `emptied_and_deleted` 62 → 73 and 70 (mean +9.5), `empty_file_deleted` 54 → 46 and 51 (mean -5). Mean delta 0.0. One target rose just under the threshold and the other fell, so it was not kept on its own; tried again combined with the provider sentence below.

### git: the racily-clean rule stated plainly — not kept (`c-05-add-racy-plain`)

Replaced the two-sentence index rule with a six-sentence version: git compares size and mtime with the index entry and skips reading on a match, except an entry whose mtime is the same as or newer than the index file's own mtime, which it re-reads; an index file with a fresh mtime lets git skip such files; a plain copy gets a fresh mtime and a copy keeping the original's mtime behaves like the original. Target `capture.same_size_edit_a_second_later`: 54 → 60, the same as its baseline 60/59. No effect, which matches the earlier probe: Jev holds each link of that chain at 95% and the chain at 51%.

### node section: Buffer and fs facts — not kept (`c-05-add-node`, `c-07-node-min`)

Added a `# node` section: a zero-length Buffer is an object, truthy and not null; `equals` compares bytes; `readFileSync` of an empty file returns an empty buffer and `statSync` reports size 0; `copyFileSync` gives a fresh mtime and `utimesSync` sets timestamps; `rmSync` with force; `renameSync` replaces in one step. Targets the empty-file tests and `same_size_edit`. `capture.empty_file_created` fell 72 → 58. A minimal version with only the Buffer and empty-file sentences (`c-07-node-min`) fell it again, 72 → 60, while `empty_file_deleted` and `emptied_and_deleted` moved by 2 to 4. Telling Jev that an empty buffer is not null reliably hurts the test whose claim is that no before-image is written.

### git: its own binary heuristic — not kept (`c-05-add-git-binary`)

Added: git treats a file as binary when a NUL byte appears within its first 8000 bytes, and prints "-" for it in `diff --numstat`. Targets `capture.binary_skipped` (84 → 81) and `workspace.outside_binary_is_skipped` (78 → 67, within that test's swing). Mean delta +0.4. No effect on the targets.

### claude_code: what a running turn's transcript ends with — not kept (`c-05-add-transcript-running`)

Added: until a turn ends, the last user or assistant entry is the prompt, a tool result, or an assistant entry with stop_reason tool_use; a transcript with no user or assistant entry yet has no ended turn. Targets `running.a_look_leaves_the_turn_armed` (74 → 78) and `running.interrupted_turn_stops_growing` (68 → 65). Mean delta +0.4. Within noise.

### vscode: provider and FileNotFound semantics stated more fully — not kept alone (`c-05-add-vscode-provider`)

Replaced the provider paragraph with one saying stat returns type, timestamps and size and readFile the bytes; a stat size of 0 with an empty readFile result is an ordinary empty file; FileNotFound from readFile or stat on an already-loaded text model keeps the text, and on a never-loaded uri fails the entry; empty bytes instead of throwing shows an empty file. Targets `capture.empty_file_deleted` (54 → 60), `view.emptied_and_deleted_empty_both_render` (62 → 66) and `view.provider_serves_the_turn_and_refuses_the_unknown` (84 → 87). Mean delta +0.5. All three targets up, none by 10.

### vscode: RelativePattern watcher semantics — not kept (`c-05-add-vscode-watcher`)

Replaced the watcher sentence with one saying `createFileSystemWatcher(new RelativePattern(baseUri, name))` watches the directory for events on that name, and that VS Code's copy of an outside file lags behind disk until a watcher reports a change or the window is refocused. Targets `workspace.outside_file_is_watched_once` (84 → 87) and `running.a_look_keeps_outside_watchers` (79 → 82). Mean delta +0.5. Within noise.

### claude_code: file_path is an absolute path — not kept (`c-07-abs-path`)

Reworded the tool sentence to say `file_path` and `notebook_path` hold the absolute path of the file the tool is about to write, whether or not it exists yet. Targets the outside-file tests: none moved 10 (`outside_file_created_has_no_before_image` 70 → 74, `outside_binary_is_skipped` 78 → 71, `outside_file_is_captured` unchanged). Mean delta +0.1.

### claude_code: drop "Bash carries the command to run" — not kept (`c-07-tight-bash`)

No statement mentions Bash, so the clause is unused. Mean delta +0.4, no test moved 10 except the unstable `advert_survives_a_turn`. Harmless either way; reverted for lack of a measured gain.

### git: what add -u and add -f stage — not kept (`c-08-git-add-u`)

Added: `git add -u` stages every modified or deleted tracked file whatever its size and never touches untracked files; `git add -f` stages the paths it is given even when ignored, and an untracked file not given to it stays out of the tree. Target `capture.untracked_over_size_cap`: 76 → 81, inside its own range (76 to 85 in the finals). Mean delta 0.0.

### claude_code: nothing more is written after an interruption — not kept (`c-08-interrupt-tail`, `c-10-interrupt-tail-2`)

Added after the interruption sentence: "Nothing more is written for that turn: the next user or assistant entry in the transcript belongs to the next prompt." Targets `running.interrupted_turn_stops_growing` (64 → 72 and 70, +7 against the baseline pair) and `running.interrupted_turn_is_finished_and_published` (79 → 75 and 76). Mean delta +0.4 over two runs. The stops-growing target rose but not by 10, and its sibling fell, so it was not kept.

### git empty blob plus the fuller provider paragraph, combined — kept (`c-08-blob-provider`, `c-09-blob-provider-2`)

The two additions above that each nudged `view.emptied_and_deleted_empty_both_render` upward, applied together on the no-harness base. Two runs: `emptied_and_deleted` 62 → 73 and 71, +10 against the baseline pair; `capture.empty_file_deleted` 55 → 60 and 56; `view.provider_serves_the_turn_and_refuses_the_unknown` 87 → 82 and 82; `capture.empty_file_created` 69 → 65 and 63. Mean 81% in both runs against 80%. Against the baseline pair nothing fell by 8 or more, and the one target that was aimed at cleared the bar exactly, so this was kept as the final base. It is a borderline keep: the gain sits on the threshold and two neighbouring tests gave back 4 to 5 points.

### git: index-mtime sentence removed — not kept (`c-11-no-racy`)

The no-context runs scored `capture.same_size_edit_a_second_later` 8 points higher than the notes did, so the racily-clean sentence was removed from the blob-provider base to see whether it was a distractor. `same_size_edit` did not move (61 and 53 with the sentence, 57 without), and `retention.no_change_leaves_previous_diff` fell 79 → 64. Reverted.

## Probe: why Node buffer facts hurt `capture.empty_file_created`

`probes/empty_file_created.mjs` was run twice with the same questions: under the no-harness notes (`efc-base`) and under the notes with the minimal `node` section (`efc-node`). The statement scored 74 and 66 under the base, 69 and 61 with the node facts. Every atomic claim about the code stayed put (missing blob returns null 89 and 93%, `addChange` with a null before pushes no image 92 and 92%, the image condition 96 and 96%), but "the program writes an empty before-image file for a created empty file", which is false, rose from 38 to 45%. Telling Jev that an empty buffer is not null makes it a little more willing to believe an empty image gets written, which is the wrong direction for this claim. The weakest part of the statement under both contexts is that the created empty file is listed at all (62 and 59%), with the direct question at 71 and 69%.

## Final notes and result

The final `context-notes.md` is the original minus the `test_harness` section, plus one sentence in the git section on what `cat-file --batch` prints for an empty blob, and a fuller provider paragraph in the vscode section (stat returns type, timestamps and size; a size of 0 with empty bytes is an ordinary empty file; FileNotFound keeps an already-loaded model's text and fails a never-loaded entry; empty bytes instead of a throw shows an empty file). Everything in it is about Claude Code, VS Code or git.

| | w-final-1 | w-final-2 | c-final-1 | c-final-2 | none-1 | none-2 |
| --- | --- | --- | --- | --- | --- | --- |
| pass at 50% | 59/59 | 59/59 | 58/59 | 59/59 | 59/59 | 59/59 |
| mean | 80% | 80% | 80% | 81% | 79% | 79% |
| tests under 70% (pair mean) | 8 | | 7 | | 11 | |

Against the `w-final` pair the final notes are worth +0.1 on the mean: `retention.new_prompt_discards_abandoned_turn` +12 (the harness removal), `view.emptied_and_deleted_empty_both_render` +8 (the blob and provider sentences, +10 in their own confirmation pair), and `workspace.outside_file_created_has_no_before_image` -9, a test that swings 63 to 79 between runs with nothing aimed at it. Against the no-context pair the final notes are worth +1.4 on the mean: `running.running_turn_is_brought_up_to_date` +21, `view.move_renders_as_rename` +15, `retention.advert_survives_a_turn` +15, `view.a_m_d_become_the_right_sides` +10. The final pair differs by a median of 2 points per test and at most 14.

## Every change and its effect

| Change | Runs | Effect on its targets | Kept |
| --- | --- | --- | --- |
| remove `test_harness` | c-01 | `new_prompt_discards_abandoned_turn` +10 to +14 in every later run; mean unchanged | yes |
| remove `claude_code` | c-02 | `outside_binary_is_skipped` -27 | no |
| remove `vscode` | c-03 | `move_renders_as_rename` -15, `reverted_by_hand` -12, `outside_file_created` -13 | no |
| remove `git` | c-04 | nothing by 10; mean 0.0 | no |
| add cat-file empty-blob record | c-05, c-06 | `emptied_and_deleted` +9.5, `empty_file_deleted` -5 | only combined |
| restate racily-clean rule plainly | c-05 | `same_size_edit` 0 | no |
| add `node` buffer and fs facts | c-05, c-07 | `empty_file_created` -14 and -12 | no |
| add git's binary heuristic | c-05 | `binary_skipped` -3, `outside_binary` within swing | no |
| add what a running turn's transcript ends with | c-05 | `a_look_leaves` +4, `interrupted_stops_growing` -3 | no |
| fuller provider and FileNotFound paragraph | c-05 | `empty_file_deleted` +6, `emptied_and_deleted` +4, `provider_serves` +3 | only combined |
| RelativePattern watcher semantics | c-05 | `outside_file_is_watched_once` +3, `a_look_keeps_outside_watchers` +3 | no |
| `file_path` is an absolute path | c-07 | outside-file tests within noise | no |
| drop "Bash carries the command to run" | c-07 | nothing; mean +0.4 | no |
| add what `add -u` and `add -f` stage | c-08 | `untracked_over_size_cap` +5 | no |
| nothing more is written after an interruption | c-08, c-10 | `interrupted_stops_growing` +7, `interrupted_is_finished` -3 | no |
| empty-blob record plus provider paragraph | c-08, c-09 | `emptied_and_deleted` +10, mean +0.6 | yes |
| remove the index-mtime sentence | c-11 | `same_size_edit` 0, `no_change_leaves_previous_diff` -15 | no |

## What did not work, in one place

Outside-world facts moved the low scorers very little. The tests still under 70 (`empty_file_deleted`, `same_size_edit`, `interrupted_turn_stops_growing`, `emptied_and_deleted` at 70, `empty_file_created`, `new_prompt_discards` and `outside_binary` on their bad days) fail on hops through the code, not on missing knowledge: the probes show Jev already holding the relevant git and runtime facts at 90% and above, and the wording notes showed the same limit from the other side. Adding facts that describe what a value is (an empty buffer is truthy, a size-0 blob prints an empty body) can push a claim the wrong way when the statement is about something being absent. Removing sections is more informative than adding sentences: each of `claude_code` and `vscode` carries two or three tests by 12 to 27 points, `git` carries none by 10, and the harness section cost one test 10 points by describing the project.

The one flip in the final pair is capture.empty_file_deleted (45 and 59), which sits on the 50% line whatever the notes say.
