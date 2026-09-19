# capture
files: src/turn/index.js src/turn/capture.js src/turn/collect.js src/utils/git.js src/utils/files.js src/store/manifest.js src/store/paths.js

## every_changed_file
behavior: Every file a turn changed is listed in its diff, whether it was modified, created or deleted. For a modified or deleted file, the before-image keeps exactly what the file held before the turn started. A file the turn created has no before-image.

## changed_and_changed_back
behavior: A file that a turn changed and then changed back to its original contents is not reported. Only files whose contents differ from before the turn appear in the diff.

## empty_file_created
behavior: Creating an empty file is recorded as an addition, and no before-image is written for it. The absence of a before-image is what marks an addition, so an empty before-image would wrongly read as an unchanged file.

## empty_file_deleted
behavior: Deleting a file that was empty is recorded as a deletion, and a zero-byte before-image is kept for it. Without that image the deletion would read as a creation.

## binary_skipped
behavior: Binary files that changed during a turn are left out of the diff entirely, since the diff editor cannot render them. Text files changed in the same turn are still listed.

## untracked_over_size_cap
behavior: An untracked file larger than one megabyte is ignored, even if the turn rewrote it. Tracked files are never size-filtered.

## same_size_edit_a_second_later
behavior: An edit that keeps a file the same size, made within the same second the file was last committed, is still detected even when the turn's end is not checked until a second or more later. Git's stat cache is not allowed to hide it.

## move_is_one_change
behavior: A file the turn moved appears once in the diff, under both its old path and its new path, not as a deletion beside an addition and not as an addition out of nowhere. This holds when the moved file was also edited.

## move_keeps_old_contents_as_before_image
behavior: A file that was moved and edited diffs against what it held at its old path, so the edit is visible.

## explorer_order
behavior: Changes are listed in the order the explorer shows files: folders before files at every level, names compared the way the explorer compares them, and a moved file placed where it landed.

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
behavior: When a new turn ends, its before-images replace those of the previous turn, so the images always describe the turn the published diff describes.

## advert_survives_a_turn
behavior: A turn that ends and publishes a diff leaves the window's server advert in place. Publishing clears the turn's own state and nothing else.

## no_change_leaves_previous_diff
behavior: A turn that changes nothing publishes nothing and leaves the previous turn's diff and before-images untouched.

## new_prompt_discards_abandoned_turn
behavior: When a new prompt arrives while an earlier turn was left armed and never ended, the earlier turn's state is discarded. The new turn measures against the files as they are now, not against the stale baseline.

## same_prompt_id_keeps_baseline
behavior: A prompt-submitted event that carries the running turn's own prompt id, such as a queued message or a finished background command being handed to the turn, does not reset the turn. Everything the turn changed before that event is still in its diff.

## subagent_failure_does_not_end_turn
behavior: A subagent that fails on an API error does not end the turn it runs in. Its stop event publishes nothing and leaves the turn's baseline in place, and the turn's own end still reports everything that changed.

# running
files: src/turn/index.js src/turn/collect.js src/view.js src/store/manifest.js src/store/transcript.js src/store/paths.js src/utils/watch.js src/utils/workspace.js

## running_turn_shows_changes_so_far
behavior: Asking for the diff while a turn is still running shows what the turn has changed so far, under the title "Changes so far".

## running_turn_is_brought_up_to_date
behavior: Each time the diff of a running turn is asked for, it is collected afresh, so files changed since the last look are included.

## interrupted_turn_is_finished_and_published
behavior: A turn the user interrupted gets no Stop hook, so asking for its diff finishes it: the diff is published as a finished turn under the title "Last turn changes", and the turn is no longer armed.

## interrupted_turn_stops_growing
behavior: Once an interrupted turn has been finished by looking at it, later edits made by hand do not join its diff.

## ended_turn_is_never_collected_again
behavior: A turn that ended is a record of what it did. Files edited by hand afterwards do not appear in its diff.

## running_turn_with_no_changes_falls_back
behavior: Asking for the diff while a turn is armed but has changed nothing yet shows the last finished turn's diff instead.

## missing_stop_hook_is_published_on_request
behavior: A turn whose Stop hook never arrived, for example because the window was closed as it finished, is published as a finished turn when its diff is asked for, provided the transcript shows the turn is over.

## paused_turn_is_still_running
behavior: A transcript whose last reply stopped to call a tool, or stopped with a reason not known to end a turn, is treated as still running. Only a reason known to end a turn ends one.

## a_look_leaves_the_turn_armed
behavior: Looking at a running turn does not consume its baseline. The turn stays armed, the rest of it is still captured, and its own end publishes everything.

## a_look_keeps_outside_watchers
behavior: Looking at a running turn keeps watching the files outside the workspace that it touched. The watchers are released only when the turn ends.

## a_look_and_the_end_get_distinct_stamps
behavior: A look at a running turn and the end of the same turn produce different stamps even within the same second, so the finished diff is never mistaken for the one already on screen.

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
behavior: When a window regains focus it takes the advert back if another window has overwritten it, so the window being looked at is the one being served. When a window shuts down while another window owns the advert, it leaves that advert alone.

## moving_to_another_project_moves_the_advert
behavior: When a window's first workspace folder changes to another project, its advert moves there and the old project is no longer served. The first folder keys the project, so adding a second folder after it changes nothing.

# view
files: src/view.js src/turn/index.js src/turn/collect.js src/store/manifest.js src/store/paths.js src/utils/files.js src/utils/workspace.js

## a_m_d_become_the_right_sides
behavior: A modified file renders with the before-image on the left and the real file on the right, with both sides on the same path so the editor does not infer a rename. An added file has no left side and a deleted file has no right side.

## each_turn_gets_a_distinct_before_uri
behavior: Each turn addresses its before-images by a distinct uri, so the editor cannot serve a previous turn's cached contents.

## provider_serves_the_turn_and_refuses_the_unknown
behavior: The before-image provider serves the contents and size of the published turn's images, and throws for any uri it does not know, so the editor keeps what it has instead of showing an empty file.

## before_image_resolves_without_a_render
behavior: A before-image can be resolved straight from the published turn, without a render having primed anything, which is what a diff restored after a restart needs.

## emptied_and_deleted_empty_both_render
behavior: A file emptied by the turn and an empty file deleted by the turn both reach the editor. The deleted file's before-image is served as zero bytes, not as missing, and the emptied file's before-image still holds its old text.

## reverted_by_hand_drops_out
behavior: A file the user reverted by hand after the turn drops out of the diff when it is opened, while the other changes remain.

## move_renders_as_rename
behavior: A moved file renders as one entry named by where it landed, with its two sides on different paths so the editor shows it as a rename.

## superseded_before_image_is_refused
behavior: Once a later turn has published, a before-image uri from the earlier turn is refused rather than quietly served the new turn's contents.

## only_additions_still_render
behavior: A turn that only added files still renders, even though no before-image was written for it.

## finished_diff_is_kept
behavior: The diff of a finished turn is kept as a regular tab right after it opens, so the next thing opened as a preview cannot replace it.

## empty_diff_and_running_look_stay_previews
behavior: An empty diff and a look at a running turn are left as preview tabs. Only a finished diff with something in it is kept.

# workspace
files: src/turn/index.js src/turn/capture.js src/turn/collect.js src/utils/watch.js src/utils/files.js src/utils/git.js src/store/paths.js src/store/manifest.js

## two_repositories_one_manifest
behavior: A turn touching two repositories in a multi-root workspace produces one diff listing the changes from both.

## outside_file_is_captured
behavior: A file outside every repository that a tool named before writing is captured, and appears in the diff alongside the repository changes.

## outside_file_created_has_no_before_image
behavior: A file outside every repository that did not exist when the turn armed is captured as an addition, with no before-image.

## outside_binary_is_skipped
behavior: A binary file outside every repository is skipped rather than counted, so the diff's file count matches what it renders.

## outside_file_is_watched_once
behavior: A file outside the workspace is watched from the moment a tool names it, once, however many times it is named. Files inside the workspace get no watcher, and the watchers are released when the turn ends.

## two_projects_do_not_overwrite_each_other
behavior: Each project has its own diff and before-images. A turn in one project leaves another project's published turn intact.

## outside_files_come_last_in_tree_order
behavior: Files outside every repository are listed after the repository changes, in tree order among themselves rather than in the order they were touched.
