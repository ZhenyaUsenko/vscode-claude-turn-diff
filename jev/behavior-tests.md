# capture
files: src/turn/index.js src/turn/capture.js src/turn/collect.js src/utils/git.js src/utils/files.js src/store/manifest.js src/store/paths.js

## every_changed_file
behavior: A text file inside a workspace repository that a turn modified, created or deleted is listed as a change in the diff. The before-image of a modified or deleted file holds the contents the file had when the turn started, and a created file has no before-image.

## changed_and_changed_back
behavior: A file that a turn changed and then changed back to its original contents is not reported. Only files whose contents differ from before the turn appear in the diff.

## empty_file_created
behavior: Creating an empty file lists the file in the diff and writes no before-image for it.

## empty_file_deleted
behavior: Deleting a file that was empty is recorded as a deletion, and a zero-byte before-image is kept for it. Without that image the deletion would read as a creation.

## binary_skipped
behavior: A file whose contents hold a NUL byte within the first 8000 bytes, either before or after the turn, is left out of the diff. A text file changed in the same turn is listed.

## untracked_over_size_cap
behavior: An untracked file larger than MAX_UNTRACKED_BYTES, one megabyte, is left out of both snapshots, so rewriting it during the turn lists nothing for it. A tracked file is staged whatever its size.

## same_size_edit_a_second_later
behavior: An edit that keeps a file the same size, made within the same second the file was last committed, is still detected even when the turn's end is not checked until a second or more later. Git's stat cache is not allowed to hide it.

## move_is_one_change
behavior: A file the turn moved is recorded as a single change whose beforeFile is the file's old path and whose afterFile is its new path. A file that was moved and had one line edited is recorded the same way.

## move_keeps_old_contents_as_before_image
behavior: For a file that was moved and edited, the before-image is written under the file's old path and holds the contents the file had at that path when the turn started.

## explorer_order
behavior: Changes in the manifest are sorted by afterFile in tree order: at each level of the path, directories come before files, and names are compared with a locale collator that reads digits as numbers. A moved file is placed by its new path.

# install
files: src/install/settings.js src/install/spec.js

## exact_spec_is_registered
behavior: Settings holding exactly the extension's hook specification count as registered.

## empty_settings_are_not
behavior: Settings with no hooks at all do not count as registered.

## missing_event_is_not
behavior: Settings missing one of the extension's hook events, such as StopFailure, do not count as registered.

## changed_entry_is_not
behavior: A hook whose matcher, timeout or command differs from the specification means the hooks are not registered, so the user is prompted again rather than left running an outdated registration.

## foreign_hooks_are_ignored
behavior: Hooks belonging to other tools, whether on the same events or on other events, are ignored when deciding whether the extension's hooks are registered. Only the extension's own entries are compared to the specification.

# retention
files: src/turn/index.js src/turn/capture.js src/turn/collect.js src/store/manifest.js src/store/paths.js src/store/transcript.js src/utils/files.js

## later_turn_replaces_before_images
behavior: When a later turn ends and publishes, the beforeImages directory is cleared and rewritten with that turn's before-images, so the before-image of a file changed by both turns holds what the file held when the later turn started.

## advert_survives_a_turn
behavior: server.json, the window's advert in the project directory, survives a turn that ends and publishes a diff. Ending a turn removes the armed-turn files and rewrites the manifest and the before-images, and touches nothing else in the project directory.

## no_change_leaves_previous_diff
behavior: A turn that changes nothing publishes nothing and leaves the previous turn's diff and before-images untouched.

## new_prompt_discards_abandoned_turn
behavior: When a new prompt arrives while an earlier turn was left armed and never ended, the earlier turn's state is discarded. The new turn measures against the files as they are now, not against the stale baseline.

## same_prompt_id_keeps_baseline
behavior: A prompt-submitted event that carries the running turn's own prompt id, such as a queued message or a finished background command being handed to the turn, does not reset the turn. Everything the turn changed before that event is still in its diff.

## subagent_failure_does_not_end_turn
behavior: An end event whose payload carries an agent_id, as a subagent's does, returns published false and leaves the armed turn as it is. The main turn's own end later publishes everything the turn changed, including what changed before the subagent's event.

# running
files: src/turn/index.js src/turn/collect.js src/view.js src/store/manifest.js src/store/transcript.js src/store/paths.js src/utils/watch.js src/utils/workspace.js

## running_turn_shows_changes_so_far
behavior: Asking for the diff while a turn is still running shows what the turn has changed so far, under the title "Changes so far".

## running_turn_is_brought_up_to_date
behavior: Each time the diff of a running turn is asked for, it is collected afresh, so files changed since the last look are included.

## interrupted_turn_is_finished_and_published
behavior: When the transcript shows the user interrupted the turn, asking for the diff publishes the turn's changes as a finished turn: the manifest is written with running false, the diff opens under the title Last turn changes, and the armed-turn files are removed.

## interrupted_turn_stops_growing
behavior: Once an interrupted turn has been finished by looking at it, later edits made by hand do not join its diff.

## ended_turn_is_never_collected_again
behavior: A turn that ended is a record of what it did. Files edited by hand afterwards do not appear in its diff.

## running_turn_with_no_changes_falls_back
behavior: Asking for the diff while a turn is armed but has changed nothing yet publishes no manifest, so the previously published diff opens, under the title Last turn changes.

## missing_stop_hook_is_published_on_request
behavior: A turn whose Stop hook never arrived, for example because the window was closed as it finished, is published as a finished turn when its diff is asked for, provided the transcript shows the turn is over.

## paused_turn_is_still_running
behavior: A transcript whose last reply stopped to call a tool, or stopped with a reason not known to end a turn, is treated as still running. Only a reason known to end a turn ends one.

## a_look_leaves_the_turn_armed
behavior: Looking at a running turn does not consume its baseline. The turn stays armed, the rest of it is still captured, and its own end publishes everything.

## a_look_keeps_outside_watchers
behavior: Looking at a running turn keeps watching the files outside the workspace that it touched. The watchers are released only when the turn ends.

## a_look_and_the_end_get_distinct_stamps
behavior: Every published manifest carries a stamp made from the current time in milliseconds and the process id, so the manifest published by a look at a running turn and the one published when that turn ends a moment later carry different stamps.

## only_a_publishing_end_reports_published
behavior: Only a turn that published something reports that it did, which is what opens the diff. A turn that changed nothing does not reopen the diff it left alone.

# server
files: src/server.js src/turn/index.js src/store/paths.js src/utils/workspace.js src/utils/files.js hooks/turn-diff.sh

## readvertising_unchanged_leaves_advert
behavior: Re-advertising a window whose project and port have not changed leaves the advert file untouched.

## no_folders_serves_home
behavior: A window with no folder open serves the home directory's project, where Claude Code files a chat started without a folder. When a folder arrives, the advert moves to that project and the home advert is removed, so a window has one advert at a time.

## deleted_advert_is_rewritten
behavior: If the advert file is deleted underneath a window, the next re-advertise writes it again.

## dispose_removes_advert
behavior: Shutting the server down removes its advert.

## hook_keys_by_transcript_not_cwd
behavior: The hook script files a turn under the project the session started in, taken from the transcript path in the payload, never under the directory Claude happened to change into.

## end_through_hook_opens_diff
behavior: When a turn ends through the hook script and publishes a diff, the extension is told so and opens the diff once. Nothing watches the manifest file, so the publisher has to announce it.

## focus_takes_advert_back_and_leaves_a_foreign_one
behavior: Re-advertising rewrites server.json with this window's port and token when the file holds another window's advert. Disposing the server removes server.json only while it still holds the contents this window last wrote, so an advert another window has written since is left in place.

## moving_to_another_project_moves_the_advert
behavior: When a window's first workspace folder changes to another project, its advert moves there and the old project is no longer served. The first folder keys the project, so adding a second folder after it changes nothing.

# view
files: src/view.js src/turn/index.js src/turn/collect.js src/store/manifest.js src/store/paths.js src/utils/files.js src/utils/workspace.js

## a_m_d_become_the_right_sides
behavior: A modified file renders with the before-image on the left and the real file on the right, with both sides on the same path so the editor does not infer a rename. An added file has no left side and a deleted file has no right side.

## each_turn_gets_a_distinct_before_uri
behavior: The before-image uri of a file carries the published manifest's stamp as its query, so two turns that both changed the same file address its before-image by two different uris.

## provider_serves_the_turn_and_refuses_the_unknown
behavior: For a uri whose query is the published manifest's stamp, the before-image provider's readFile returns the before-image contents and its stat returns the before-image size. For a uri whose query does not match, both throw FileNotFound.

## before_image_resolves_without_a_render
behavior: A before-image can be resolved straight from the published turn, without a render having primed anything, which is what a diff restored after a restart needs.

## emptied_and_deleted_empty_both_render
behavior: When a turn deletes a file that was empty, the file is listed in the diff with a before-image, and for that image the provider's stat reports size 0 and readFile returns empty contents. When a turn empties a file that had text, the file is listed and the provider returns its old text as the before-image.

## reverted_by_hand_drops_out
behavior: When the diff is opened, getResources leaves out a change whose file holds exactly the bytes its before-image holds, so a file the user reverted by hand after the turn is left out of the diff while the other changes are listed.

## move_renders_as_rename
behavior: A moved file renders as one entry named by where it landed, with its two sides on different paths so the editor shows it as a rename.

## superseded_before_image_is_refused
behavior: Once a later turn has published, a before-image uri from the earlier turn is refused rather than quietly served the new turn's contents.

## only_additions_still_render
behavior: A turn that only added files still renders, even though no before-image was written for it.

## finished_diff_is_kept
behavior: The diff of a finished turn is kept as a regular tab right after it opens, so the next thing opened as a preview cannot replace it.

## empty_diff_and_running_look_stay_previews
behavior: workbench.action.keepEditor runs only after a diff that lists at least one change and whose manifest has running false. Opening an empty diff, or a look at a running turn, executes vscode.changes alone.

# workspace
files: src/turn/index.js src/turn/capture.js src/turn/collect.js src/utils/watch.js src/utils/files.js src/utils/git.js src/store/paths.js src/store/manifest.js

## two_repositories_one_manifest
behavior: A turn touching two repositories in a multi-root workspace produces one diff listing the changes from both.

## outside_file_is_captured
behavior: A file outside every repository that a tool named before writing is captured, and appears in the diff alongside the repository changes.

## outside_file_created_has_no_before_image
behavior: When an Edit or Write tool names a path outside every repository that does not exist yet and the turn then creates the file, the file is listed in the diff and no before-image is written for it.

## outside_binary_is_skipped
behavior: A binary file outside every repository is skipped rather than counted, so the diff's file count matches what it renders.

## outside_file_is_watched_once
behavior: The first arm naming a file outside the workspace creates one file system watcher on that file's directory and name. A later arm naming the same file creates no second watcher, an arm naming a file inside the workspace creates none, and ending the turn disposes the watchers.

## two_projects_do_not_overwrite_each_other
behavior: Each project has its own diff and before-images. A turn in one project leaves another project's published turn intact.

## outside_files_come_last_in_tree_order
behavior: Files outside every repository are listed after the repository changes, in tree order among themselves rather than in the order they were touched.
