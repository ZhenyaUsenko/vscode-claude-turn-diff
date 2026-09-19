# Wording notes

A record of every rewrite tried on `behavior-tests.md`, with the score before and after. Scores are Jev's Noul answers in percent, from `node jev/run-tests.mjs --tests behavior-tests.md --files all --context notes`. The starting score of a test is the mean of `behavior-1` and `behavior-2`. Across those two identical runs a test moved by a median of 2 points and at most 13, so a rewrite counted as an improvement at 10 points or more confirmed by a second run, or 15 or more in one run. A rewrite that did not improve the score was reverted, and after two failed rewrites the best truthful version was left in place. Three tests got a third attempt after a probe pointed at a specific cause.

Test runs, in order: `behavior-1`, `behavior-2` (baseline, before this work), `w-01-low9`, `w-02-tier2`, `w-03-retry`, `w-04-precise`, `w-05-probed`, `w-final-1`, `w-final-2`. Probe runs: `ecf-1` to `ecf-4` (`capture.every_changed_file`, before this work), `efd-1` (`capture.empty_file_deleted`), `alt-1` (`running.a_look_leaves_the_turn_armed`), `sse-1` (`capture.same_size_edit_a_second_later`), `rbh-1` (`view.reverted_by_hand_drops_out`). The probe modules are in `probes/`.

## Result

| | behavior-1 | behavior-2 | w-final-1 | w-final-2 |
| --- | --- | --- | --- | --- |
| pass at 50% | 55/59 | 56/59 | 59/59 | 59/59 |
| mean | 73% | 72% | 80% | 80% |
| tests under 70% (mean of the pair) | 22 | | 8 | |

The two final runs differ by a median of 2 points per test and at most 9, so they are as stable as the baseline pair. 25 tests were touched; 21 rewrites were kept and 4 tests went back to their original wording.

## Every touched test, all runs

Columns: b1 b2 are the baseline runs, w1 to w5 the working runs, f1 f2 the final runs. The wording in force during each run is noted under the test.

```
test                                                        b1  b2  w1  w2  w3  w4  w5  f1  f2
capture.every_changed_file                                  38  35  85  81  84  62  71  83  85
capture.move_is_one_change                                  34  33  81  85  83  84  84  84  82
view.emptied_and_deleted_empty_both_render                  36  31  56  56  69  66  62  63  61
running.a_look_and_the_end_get_distinct_stamps              42  54  90  89  89  88  87  89  89
workspace.outside_file_created_has_no_before_image          50  53  72  75  61  75  68  79  74
running.running_turn_with_no_changes_falls_back             52  55  73  71  73  65  72  67  72
capture.empty_file_deleted                                  54  54  45  33  46  57  56  53  58
capture.empty_file_created                                  58  58  68  69  71  69  66  68  70
retention.advert_survives_a_turn                            60  63  80  84  83  85  83  83  82
capture.binary_skipped                                      59  60  63  85  85  85  89  88  85
capture.same_size_edit_a_second_later                       60  56  60  60  56  54  61  60  59
capture.explorer_order                                      61  58  59  83  82  81  76  84  81
capture.move_keeps_old_contents_as_before_image             66  67  67  82  82  83  82  82  82
retention.later_turn_replaces_before_images                 68  71  73  79  80  79  74  77  76
retention.subagent_failure_does_not_end_turn                64  57  57  78  75  79  77  80  77
running.interrupted_turn_is_finished_and_published          57  56  62  83  79  81  80  77  80
running.interrupted_turn_stops_growing                      68  66  68  64  59  65  66  63  65
running.a_look_leaves_the_turn_armed                        71  69  70  48  59  64  61  75  72
server.focus_takes_advert_back_and_leaves_a_foreign_one     64  62  62  92  91  92  92  89  92
view.each_turn_gets_a_distinct_before_uri                   67  62  63  89  90  90  91  90  90
view.provider_serves_the_turn_and_refuses_the_unknown       74  66  72  82  88  88  84  86  87
view.reverted_by_hand_drops_out                             61  59  66  62  59  58  79  73  75
view.empty_diff_and_running_look_stay_previews              62  55  57  79  78  82  76  80  80
workspace.outside_file_is_watched_once                      68  72  74  88  88  89  89  86  88
capture.untracked_over_size_cap                             67  70  73  80  82  81  83  76  85
```

## Kept rewrites

### capture.every_changed_file (37 → 84)

Old: Every file a turn changed is listed in its diff, whether it was modified, created or deleted. For a modified or deleted file, the before-image keeps exactly what the file held before the turn started. A file the turn created has no before-image.

New (w1 onwards, except w4 and w5): A text file inside a workspace repository that a turn modified, created or deleted is listed as a change in the diff. The before-image of a modified or deleted file holds the contents the file had when the turn started, and a created file has no before-image.

Why: the ecf probes said the statement overclaims (85%), put the weakest part at "every file" (55 to 61%) and named binaries as the main gap (65 to 68%), then files outside repositories. Scoping to text files inside a workspace repository removes both. The claim is still true and more precise.

Two more precise variants were tried and not kept. Adding the size cap as an exception, "..., unless it is untracked and larger than one megabyte", scored 62 (w4). Stating it as a positive condition, "..., as long as it is tracked or under one megabyte", scored 71 (w5). Both are truthful, and the cap is a real exception, but it already has its own statement in this suite (`untracked_over_size_cap`), so the general rule is kept here without it. Zhenya may prefer the 71% variant; it is the more complete sentence.

### capture.move_is_one_change (34 → 83)

Old: A file the turn moved appears once in the diff, under both its old path and its new path, not as a deletion beside an addition and not as an addition out of nowhere. This holds when the moved file was also edited.

New: A file the turn moved is recorded as a single change whose beforeFile is the file's old path and whose afterFile is its new path. A file that was moved and had one line edited is recorded the same way.

Why: two negations gone, and "appears once, under both paths" read as a contradiction. Uses the manifest's own field names.

### view.emptied_and_deleted_empty_both_render (34 → 62)

Old: A file emptied by the turn and an empty file deleted by the turn both reach the editor. The deleted file's before-image is served as zero bytes, not as missing, and the emptied file's before-image still holds its old text.

First (w1, w2, 56): When a turn deletes a file that was empty, the file is listed in the diff and the before-image provider serves its before-image as an empty file of size 0. When a turn empties a file, the file is listed and its before-image holds the text the file had before.

Second, kept (w3 onwards, 62 to 69): When a turn deletes a file that was empty, the file is listed in the diff with a before-image, and for that image the provider's stat reports size 0 and readFile returns empty contents. When a turn empties a file that had text, the file is listed and the provider returns its old text as the before-image.

Why: "not as missing" removed, each case stated positively, and the provider's two methods named. Still under 70 after two attempts, for the same reason `empty_file_deleted` resists: Jev doubts that an empty before-image is written and served at all (see the `efd-1` probe below).

### running.a_look_and_the_end_get_distinct_stamps (48 → 89)

Old: A look at a running turn and the end of the same turn produce different stamps even within the same second, so the finished diff is never mistaken for the one already on screen.

New: Every published manifest carries a stamp made from the current time in milliseconds and the process id, so the manifest published by a look at a running turn and the one published when that turn ends a moment later carry different stamps.

Why: the consequence clause described a mechanism the code no longer has (nothing compares stamps to decide whether to render), so Jev could not find it. The rewrite states what `publishManifest` writes.

### workspace.outside_file_created_has_no_before_image (52 → 77)

Old: A file outside every repository that did not exist when the turn armed is captured as an addition, with no before-image.

New: When an Edit or Write tool names a path outside every repository that does not exist yet and the turn then creates the file, the file is listed in the diff and no before-image is written for it.

Why: "captured as an addition" names a status the code never stores, and "when the turn armed" is not the condition; a tool naming the path is. The rewrite states the trigger the code reacts to.

### running.running_turn_with_no_changes_falls_back (54 → 70)

Old: Asking for the diff while a turn is armed but has changed nothing yet shows the last finished turn's diff instead.

New: Asking for the diff while a turn is armed but has changed nothing yet publishes no manifest, so the previously published diff opens, under the title Last turn changes.

Why: "falls back" and "instead" suggest a special case the code does not have. The rewrite follows the code: nothing is published, so the manifest already on disk is what is read. Scores 65 to 73 across runs, so it sits on the 70 line.

### capture.empty_file_created (58 → 69)

Old: Creating an empty file is recorded as an addition, and no before-image is written for it. The absence of a before-image is what marks an addition, so an empty before-image would wrongly read as an unchanged file.

New: Creating an empty file lists the file in the diff and writes no before-image for it.

Why: the second sentence was a counterfactual, and "recorded as an addition" names a status the code never stores. Six runs at 66 to 71 confirm a modest gain.

### retention.advert_survives_a_turn (62 → 83)

Old: A turn that ends and publishes a diff leaves the window's server advert in place. Publishing clears the turn's own state and nothing else.

New: server.json, the window's advert in the project directory, survives a turn that ends and publishes a diff. Ending a turn removes the armed-turn files and rewrites the manifest and the before-images, and touches nothing else in the project directory.

Why: "clears the turn's own state and nothing else" was false as written, since publishing also rewrites the manifest and before-images. The rewrite names the file and lists exactly what ending a turn touches.

### capture.binary_skipped (60 → 87)

Old: Binary files that changed during a turn are left out of the diff entirely, since the diff editor cannot render them. Text files changed in the same turn are still listed.

New: A file whose contents hold a NUL byte within the first 8000 bytes, either before or after the turn, is left out of the diff. A text file changed in the same turn is listed.

Why: states the code's own rule (`BINARY_SNIFF_BYTES`, checked on both sides) instead of the word "binary" and a rationale about the editor.

### capture.explorer_order (60 → 83)

Old: Changes are listed in the order the explorer shows files: folders before files at every level, names compared the way the explorer compares them, and a moved file placed where it landed.

New: Changes in the manifest are sorted by afterFile in tree order: at each level of the path, directories come before files, and names are compared with a locale collator that reads digits as numbers. A moved file is placed by its new path.

Why: "the way the explorer compares them" was vague; the rewrite names the comparator the code uses.

### capture.move_keeps_old_contents_as_before_image (67 → 82)

Old: A file that was moved and edited diffs against what it held at its old path, so the edit is visible.

New: For a file that was moved and edited, the before-image is written under the file's old path and holds the contents the file had at that path when the turn started.

Why: "diffs against" and "so the edit is visible" describe the editor; the rewrite describes what is written and where.

### retention.later_turn_replaces_before_images (70 → 77, marginal)

Old: When a new turn ends, its before-images replace those of the previous turn, so the images always describe the turn the published diff describes.

New: When a later turn ends and publishes, the beforeImages directory is cleared and rewritten with that turn's before-images, so the before-image of a file changed by both turns holds what the file held when the later turn started.

Why: "always describe" was a universal; the rewrite names the directory and what it holds. Kept as a marginal gain: every run with the new wording (74 to 80) is above both baseline runs (68, 71), but the gain is 7 to 11 points rather than a confirmed 10.

### retention.subagent_failure_does_not_end_turn (61 → 79)

Old: A subagent that fails on an API error does not end the turn it runs in. Its stop event publishes nothing and leaves the turn's baseline in place, and the turn's own end still reports everything that changed.

New: An end event whose payload carries an agent_id, as a subagent's does, returns published false and leaves the armed turn as it is. The main turn's own end later publishes everything the turn changed, including what changed before the subagent's event.

Why: positive statement of the guard in the code's terms (`agent_id`, `published`).

### running.interrupted_turn_is_finished_and_published (56 → 79)

Old: A turn the user interrupted gets no Stop hook, so asking for its diff finishes it: the diff is published as a finished turn under the title "Last turn changes", and the turn is no longer armed.

New: When the transcript shows the user interrupted the turn, asking for the diff publishes the turn's changes as a finished turn: the manifest is written with running false, the diff opens under the title Last turn changes, and the armed-turn files are removed.

Why: the condition the code checks is the transcript, not the absence of a hook, and the results are named as the code writes them.

### server.focus_takes_advert_back_and_leaves_a_foreign_one (63 → 91)

Old: When a window regains focus it takes the advert back if another window has overwritten it, so the window being looked at is the one being served. When a window shuts down while another window owns the advert, it leaves that advert alone.

New: Re-advertising rewrites server.json with this window's port and token when the file holds another window's advert. Disposing the server removes server.json only while it still holds the contents this window last wrote, so an advert another window has written since is left in place.

Why: "regains focus" and "shuts down" are the extension's wiring, not the server's; the rewrite names what `advertise` and `disposeServer` do.

### view.each_turn_gets_a_distinct_before_uri (65 → 90)

Old: Each turn addresses its before-images by a distinct uri, so the editor cannot serve a previous turn's cached contents.

New: The before-image uri of a file carries the published manifest's stamp as its query, so two turns that both changed the same file address its before-image by two different uris.

Why: the consequence about the editor's cache is not in the code; the rewrite states how the uri is built.

### view.provider_serves_the_turn_and_refuses_the_unknown (70 → 87)

Old: The before-image provider serves the contents and size of the published turn's images, and throws for any uri it does not know, so the editor keeps what it has instead of showing an empty file.

New: For a uri whose query is the published manifest's stamp, the before-image provider's readFile returns the before-image contents and its stat returns the before-image size. For a uri whose query does not match, both throw FileNotFound.

Why: names the two methods and the exact condition, and drops the consequence about the editor.

### view.reverted_by_hand_drops_out (60 → 74)

Old: A file the user reverted by hand after the turn drops out of the diff when it is opened, while the other changes remain.

First (w2, 62): When the diff is opened, a change whose file now holds the same contents as its before-image is skipped, so a file reverted by hand after the turn is left out while the other changes are listed.

Second (w3, 59): Opening the diff lists a change only while the file's contents differ from its before-image. After the user reverts one of two changed files by hand, the diff lists just the other one.

Third, kept (w5 onwards, 73 to 79): When the diff is opened, getResources leaves out a change whose file holds exactly the bytes its before-image holds, so a file the user reverted by hand after the turn is left out of the diff while the other changes are listed.

Why: probe `rbh-1` scored every atomic claim at 76 to 96% while the composite sat at 51 to 60%, and the direct question that scored 92% named `getResources` and said "holds exactly the bytes its before-image holds". Using that wording in the statement is what finally moved it.

### view.empty_diff_and_running_look_stay_previews (59 → 80)

Old: An empty diff and a look at a running turn are left as preview tabs. Only a finished diff with something in it is kept.

New: workbench.action.keepEditor runs only after a diff that lists at least one change and whose manifest has running false. Opening an empty diff, or a look at a running turn, executes vscode.changes alone.

Why: "preview tab" is VS Code's notion; the rewrite names the commands the code executes.

### workspace.outside_file_is_watched_once (70 → 87)

Old: A file outside the workspace is watched from the moment a tool names it, once, however many times it is named. Files inside the workspace get no watcher, and the watchers are released when the turn ends.

New: The first arm naming a file outside the workspace creates one file system watcher on that file's directory and name. A later arm naming the same file creates no second watcher, an arm naming a file inside the workspace creates none, and ending the turn disposes the watchers.

Why: states each case as what an `arm` does.

### capture.untracked_over_size_cap (69 → 81)

Old: An untracked file larger than one megabyte is ignored, even if the turn rewrote it. Tracked files are never size-filtered.

New: An untracked file larger than MAX_UNTRACKED_BYTES, one megabyte, is left out of both snapshots, so rewriting it during the turn lists nothing for it. A tracked file is staged whatever its size.

Why: names the constant and replaces "never size-filtered" with the positive "staged whatever its size".

## Reverted to the original wording

### capture.empty_file_deleted (54 → 55)

Original, in force again: Deleting a file that was empty is recorded as a deletion, and a zero-byte before-image is kept for it. Without that image the deletion would read as a creation.

First (w1, w2, 45 and 33): Deleting a file that was empty before the turn lists the file in the diff and writes a zero-byte before-image for it.

Second (w3, 46): When a turn deletes a file that was empty, the file is listed in the diff and an empty before-image file is written for it under beforeImages/.

Why it resists: probe `efd-1` put the weakest part at "the before-image is zero bytes long" (51%) and gave only 44% to `readBlobContents` returning an empty buffer rather than null for a size-0 blob, against 70% for `addChange` recording a change when the before contents are an empty buffer. The doubt is a hop through `cat-file --batch` output parsing, and every phrasing of "zero-byte" or "empty" before-image reads as no image. Oddly the original, with its rationale sentence, scores best of the three.

### capture.same_size_edit_a_second_later (58 → 60)

Original, in force again: An edit that keeps a file the same size, made within the same second the file was last committed, is still detected even when the turn's end is not checked until a second or more later. Git's stat cache is not allowed to hide it.

First (w2, 60): The snapshot copies .git/index aside and gives the copy the mtime of the original index, so git re-reads a file whose edit kept its size and landed in the same second as the last commit. Such an edit is listed in the diff when the turn ends a second or more later.

Second (w3, 56): An edit that leaves a file the same size, made in the same second as the file's last commit, is listed in the diff even when the turn ends a second or more later.

Why it resists: probe `sse-1` gives 95% to "the index copy keeps the original's mtime" and 96% to git's racily-clean rule from the context notes, but only 51% to the two chained ("the edit is listed when the turn ends a second later"). Jev knows each step and cannot chain them, so neither spelling the chain out nor dropping it helps. The weakest part of the original is the metaphor "Git's stat cache is not allowed to hide it" (53%), but removing it (the second attempt) did not move the score.

### running.interrupted_turn_stops_growing (67 → 64)

Original, in force again: Once an interrupted turn has been finished by looking at it, later edits made by hand do not join its diff.

First (w2, 64): Once an interrupted turn has been published by asking for its diff, its armed-turn files are gone, so asking again opens the same published diff, and a file edited by hand after the first look is absent from it.

Second (w3, 59): A look at an interrupted turn publishes it and removes its armed-turn files. A later look finds nothing armed, so it opens the same published diff, without the file edited by hand in between.

Why it resists: not probed. The claim is one of absence, resting on the transcript saying the turn is over and on nothing being collected again; both attempts to state that mechanism scored lower than the plain original.

### running.a_look_leaves_the_turn_armed (70 → 74)

Original, in force again: Looking at a running turn does not consume its baseline. The turn stays armed, the rest of it is still captured, and its own end publishes everything.

First (w2, 48): Looking at a running turn leaves snapshots.tsv and the other armed-turn files in place, so when the turn later ends, its published manifest lists both the files changed before the look and the files changed after it, with running false.

Second (w3, 59): A look at a running turn publishes a manifest with running true and leaves the armed-turn files in place. The turn's own end then publishes a manifest with running false that lists the files changed before the look as well as those changed after it.

Third (w5, 61): When the transcript shows the turn is still running, asking for the diff publishes a manifest with running true and leaves the armed-turn files in place, so the turn's own end later publishes a manifest with running false that lists the files changed before the look as well as those changed after it.

Why it resists: probe `alt-1` scores the pieces well (snapshots.tsv survives a look 79%, `endTurn` with ended false removes nothing 14%, publishes 95%, the transcript decides teardown 87%) but the Choice on what a look does to the armed files splits between "leaves them" (41%) and "depends on the transcript" (57%), and the weakest part of the original is "does not consume its baseline" (44%). Stating the transcript condition explicitly in the third attempt did not help either. The original, which names no files, stays the best of four.

## Patterns that reliably helped

- Replace a universal quantifier with the exact scope the code enforces. "Every file a turn changed" became "a text file inside a workspace repository that a turn modified, created or deleted": +47.

- Remove negations and state the positive record the code writes. "not as a deletion beside an addition and not as an addition out of nowhere" became "a single change whose beforeFile is the old path and whose afterFile is the new path": +49. "does not end the turn" became "returns published false and leaves the armed turn as it is": +18.

- Use the code's own identifiers: manifest fields (`beforeFile`, `afterFile`, `running`, the stamp), file names (`server.json`, `snapshots.tsv`, `beforeImages/`), constants (`MAX_UNTRACKED_BYTES`, the 8000-byte NUL sniff), commands and errors (`vscode.changes`, `workbench.action.keepEditor`, `FileNotFound`), and function names (`getResources`, an `arm`). Gains of 17 to 28 on six tests.

- Delete a consequence or rationale clause that describes something outside the code: "so the finished diff is never mistaken for the one already on screen" (+41), "so the editor cannot serve a previous turn's cached contents" (+26), "since the diff editor cannot render them" (+27), "so the editor keeps what it has instead of showing an empty file" (+17).

- Put the condition the code checks first. "When the transcript shows the user interrupted the turn, ..." (+22), "When an Edit or Write tool names a path outside every repository that does not exist yet, ..." (+25).

- Describe the mechanism rather than the effect on the user: "publishes no manifest, so the previously published diff opens" instead of "shows the last finished turn's diff instead" (+16).

## Patterns that did not help

- An exception clause inside the main claim. "unless it is untracked and larger than one megabyte" cost 22 points; the positive "as long as it is tracked or under one megabyte" cost 13. The sibling test that states the exception on its own scores 81.

- Spelling out a chain of inference Jev cannot follow. Narrating the index copy's mtime and git's re-read rule left `same_size_edit` where it was; the probe shows each link at 95% and the chain at 51%.

- Claims of absence resting on state that is left alone. Every rewrite of "does not consume its baseline", "leaves the armed-turn files in place" and "later edits do not join its diff" scored lower than the plain original, even when the condition was stated and even when the wording was true to the letter.

- Any spelling of "zero-byte before-image" or "empty before-image file". Jev reads it as no image, and the doubt is about a git output-parsing hop rather than the words.

- Restating a claim in code terms when the original already sat near 70 with plain words (`a_look_leaves_the_turn_armed`): four wordings, the plain one won.

## One thing worth knowing about the question form

In every probe, a direct question about a single fact scored well above the same fact routed through "Does the program in `files` behave as `behavior` describes?". For `reverted_by_hand_drops_out` the atomic questions scored 76 to 96% while the statement scored 51 to 60% in the same request. The indirection through `behavior` costs something on its own, which matches the earlier finding that placing the statement in the state scored about 10 points higher than embedding it in the question.
