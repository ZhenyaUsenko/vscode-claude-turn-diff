# capture
files: src/turn/index.js src/turn/capture.js src/turn/collect.js src/utils/git.js src/utils/files.js src/store/manifest.js src/store/paths.js

## every_changed_file
scenario: The only workspace folder is a git repository with keep.txt containing "one" and gone.txt containing "bye", both committed. handleTurn runs "begin" and then "arm" with a session id and a prompt id. Then keep.txt is rewritten to "two", added.txt is created containing "new", and gone.txt is deleted. handleTurn runs "end".
expected: manifest.json in the project's state directory lists exactly three changes, for added.txt, gone.txt and keep.txt. In the beforeImages directory the image for keep.txt holds "one" and the image for gone.txt holds "bye". There is no image for added.txt.

## changed_and_changed_back
scenario: The repository has a.txt containing "same", committed. During a turn (begin, arm, changes, end) a.txt is rewritten to "changed" and then rewritten back to "same", and b.txt is created containing "real".
expected: manifest.json lists exactly one change, for b.txt.

## empty_file_created
scenario: The repository has seed.txt committed. During a turn, added.txt is created with empty contents.
expected: manifest.json lists exactly one change, for added.txt, and no image for added.txt exists in the beforeImages directory.

## empty_file_deleted
scenario: The repository has gone.txt committed with empty contents. During a turn, gone.txt is deleted.
expected: manifest.json lists exactly one change, for gone.txt, and an image for gone.txt exists in the beforeImages directory with zero bytes.

## binary_skipped
scenario: The repository has pic.png, whose bytes begin with 0x89 0x50 0x4E 0x47 and include a zero byte, and notes.txt containing "x", both committed. During a turn pic.png is rewritten with different bytes that still include a zero byte, and notes.txt is rewritten to "y".
expected: manifest.json lists exactly one change, for notes.txt.

## untracked_over_size_cap
scenario: The repository has seed.txt committed. Before the turn arms, an untracked file big.bin of 2 MiB is created. During the turn big.bin is rewritten with different 2 MiB contents and seed.txt is rewritten.
expected: manifest.json lists exactly one change, for seed.txt.

## same_size_edit_a_second_later
scenario: The repository has f.txt containing "one", committed within the last second. handleTurn runs "begin" and "arm" in that same second. f.txt is rewritten to "two", which has the same size and lands in the same second. More than a second later, handleTurn runs "end".
expected: manifest.json lists exactly one change, for f.txt.

## move_is_one_change
scenario: The repository has old/moved.txt and old/edited.txt, each with four lines, committed. During a turn both files are renamed into a new directory, as new/moved.txt and new/edited.txt, and new/edited.txt has its second line changed.
expected: manifest.json lists exactly two changes. Each names the old path as beforeFile and the new path as afterFile: old/edited.txt to new/edited.txt and old/moved.txt to new/moved.txt. No change lists an addition or a deletion for these files.

## move_keeps_old_contents_as_before_image
scenario: The repository has old/f.txt with four lines, committed. During a turn it is renamed to new/f.txt and its second line is changed.
expected: The beforeImages directory holds an image at the old path, old/f.txt, containing the original four lines.

## explorer_order
scenario: The repository has zebra.txt, Alpha.txt, src/util/b.js, src/a.js and old/moved.txt committed. During a turn the first four are rewritten and old/moved.txt is renamed to new/moved.txt.
expected: The changes in manifest.json, read by afterFile, are in this order: new/moved.txt, src/util/b.js, src/a.js, Alpha.txt, zebra.txt.

# install
files: src/install/settings.js src/install/spec.js

## exact_spec_is_registered
scenario: hooksMatchSpec is called with a settings object whose hooks property is a deep copy of HOOK_SPEC.
expected: It returns true.

## empty_settings_are_not
scenario: hooksMatchSpec is called with an empty object.
expected: It returns false.

## missing_event_is_not
scenario: hooksMatchSpec is called with a settings object whose hooks property is a deep copy of HOOK_SPEC from which the StopFailure entry has been deleted.
expected: It returns false.

## changed_entry_is_not
scenario: hooksMatchSpec is called three times, each with a deep copy of HOOK_SPEC as hooks altered in one place: the PreToolUse matcher set to "Edit"; the Stop hook's timeout set to 5; the UserPromptSubmit hook's command changed to end in "turn-diff.sh start".
expected: It returns false all three times.

## foreign_hooks_are_ignored
scenario: hooksMatchSpec is called with a settings object whose hooks are a deep copy of HOOK_SPEC where a group holding a command "say done" has been inserted at the front of the Stop array, and an extra event Lint holds a group with the command "eslint".
expected: It returns true.

# retention
files: src/turn/index.js src/turn/capture.js src/turn/collect.js src/store/manifest.js src/store/paths.js src/store/transcript.js src/utils/files.js

## later_turn_replaces_before_images
scenario: The repository has f.txt containing "one", committed. A first turn rewrites f.txt to "two" and ends. A second turn, with a new prompt id, rewrites f.txt to "three" and ends.
expected: After the first turn the image of f.txt in the beforeImages directory holds "one". After the second turn it holds "two".

## advert_survives_a_turn
scenario: The project's state directory holds server.json with some JSON contents. A turn rewrites f.txt and ends, publishing a diff.
expected: server.json still exists afterwards.

## no_change_leaves_previous_diff
scenario: A first turn rewrites f.txt from "one" to "two" and ends. A second turn begins, arms, changes nothing, and ends.
expected: The bytes of manifest.json are identical to what the first turn wrote, and the image of f.txt in the beforeImages directory still holds "one".

## new_prompt_discards_abandoned_turn
scenario: The repository has f.txt containing "one", committed. A turn with session "abandoned" and prompt id A begins and arms, f.txt is rewritten to "two", and that session's transcript then records a user entry whose text starts with "[Request interrupted by user". A turn with session "alive" and prompt id B begins, arms, rewrites f.txt to "three" and ends.
expected: The image of f.txt in the beforeImages directory holds "two".

## same_prompt_id_keeps_baseline
scenario: The repository has f.txt and g.txt containing "one", committed. handleTurn runs "begin" and "arm" with prompt id P. f.txt is rewritten to "two". handleTurn runs "begin" again with the same prompt id P, then "arm". g.txt is rewritten to "two". handleTurn runs "end".
expected: manifest.json lists two changes, f.txt and g.txt.

## subagent_failure_does_not_end_turn
scenario: The repository has f.txt and g.txt containing "one", committed. A turn begins and arms. f.txt is rewritten to "two". handleTurn runs "end" with a payload that carries agent_id "subagent". Then g.txt is rewritten to "two" and handleTurn runs "end" with a payload that carries no agent_id.
expected: The first "end" returns { published: false }, writes no manifest.json, and leaves snapshots.tsv in place. The second "end" publishes manifest.json listing f.txt and g.txt.

# running
files: src/turn/index.js src/turn/collect.js src/view.js src/store/manifest.js src/store/transcript.js src/store/paths.js src/utils/watch.js src/utils/workspace.js

## running_turn_shows_changes_so_far
scenario: The repository has f.txt and g.txt containing "one", committed. A turn begins and arms. f.txt is rewritten to "two". showLastTurn is called with { force: true } while the session's transcript shows no end of turn and "end" has not run.
expected: The vscode.changes command is executed with the title "Changes so far" and exactly one resource, f.txt.

## running_turn_is_brought_up_to_date
scenario: A turn begins and arms. f.txt is rewritten. showLastTurn({ force: true }) runs. Then g.txt is rewritten and showLastTurn({ force: true }) runs again. The turn has not ended.
expected: The first render lists f.txt only; the second lists f.txt and g.txt.

## interrupted_turn_is_finished_and_published
scenario: A turn begins and arms. f.txt is rewritten to "two". The session's transcript then ends with a user entry whose text starts with "[Request interrupted by user", followed by a queue-operation entry. showLastTurn({ force: true }) runs.
expected: vscode.changes is executed with the title "Last turn changes" and the resource f.txt; manifest.json holds exactly one change; snapshots.tsv no longer exists.

## interrupted_turn_stops_growing
scenario: A turn begins and arms, f.txt is rewritten, and the transcript records a user interruption. showLastTurn({ force: true }) runs, then g.txt is rewritten, then showLastTurn({ force: true }) runs again.
expected: Both renders list only f.txt.

## ended_turn_is_never_collected_again
scenario: A turn rewrites f.txt and ends normally through "end". Then g.txt is rewritten by hand. showLastTurn({ force: true }) runs.
expected: vscode.changes is executed with the title "Last turn changes" and the resource f.txt only.

## running_turn_with_no_changes_falls_back
scenario: A turn rewrites f.txt and ends. A new turn begins and arms but changes nothing. showLastTurn({ force: true }) runs.
expected: vscode.changes is executed with the title "Last turn changes" and the resource f.txt.

## missing_stop_hook_is_published_on_request
scenario: A turn begins and arms. f.txt is rewritten. The transcript's last user or assistant entry is an assistant entry with stop_reason "end_turn", but "end" never runs. showLastTurn({ force: true }) runs.
expected: vscode.changes is executed with the title "Last turn changes" and the resource f.txt, and manifest.json holds exactly one change.

## paused_turn_is_still_running
scenario: A turn begins and arms. f.txt is rewritten. The transcript's last assistant entry has stop_reason "tool_use" in one case and "pause_turn" in another. showLastTurn({ force: true }) runs.
expected: In both cases vscode.changes is executed with the title "Changes so far" and the resource f.txt.

## a_look_leaves_the_turn_armed
scenario: A turn begins and arms. f.txt is rewritten. showLastTurn({ force: true }) runs. Then g.txt is rewritten and "end" runs.
expected: manifest.json lists f.txt and g.txt and its running flag is false.

## a_look_keeps_outside_watchers
scenario: A file ~/looked-at/notes.md exists outside every workspace folder. A turn begins and arms, and a further "arm" carries tool_input.file_path naming that file, which creates one file system watcher. The file is rewritten. showLastTurn({ force: true }) runs. Later "end" runs.
expected: After the look the watcher is not disposed. After "end" it is disposed.

## a_look_and_the_end_get_distinct_stamps
scenario: A turn begins and arms. f.txt is rewritten. showLastTurn({ force: true }) runs and publishes a manifest. Within the same second, "end" runs.
expected: The ts field of manifest.json after "end" differs from the ts field after the look.

## only_a_publishing_end_reports_published
scenario: A turn begins and arms, f.txt is rewritten, and "end" runs. A new turn begins and arms, nothing changes, and "end" runs.
expected: The first "end" returns { published: true } and the second returns { published: false }.

# server
files: src/server.js src/turn/index.js src/store/paths.js src/utils/workspace.js src/utils/files.js hooks/turn-diff.sh

## readvertising_unchanged_leaves_advert
scenario: The only workspace folder is a repository. startServer is called and the server starts listening, which writes server.json for the project. readvertise is then called with nothing changed.
expected: The contents of server.json are byte-identical before and after readvertise.

## no_folders_serves_home
scenario: No workspace folder is open. startServer is called and the server starts listening. Later the workspace folders become a repository and readvertise is called.
expected: At first server.json exists under the project key of the home directory and not under the repository's. After readvertise it exists under the repository's key and no longer under the home directory's.

## deleted_advert_is_rewritten
scenario: The server is listening and has written server.json. Someone deletes that file. readvertise is called.
expected: server.json exists again.

## dispose_removes_advert
scenario: The server is listening and has written server.json. dispose is called.
expected: server.json no longer exists.

## hook_keys_by_transcript_not_cwd
scenario: The server is listening for a repository. The hook script hooks/turn-diff.sh is run with the argument "arm" from an unrelated temporary directory as its working directory, with a payload on stdin whose transcript_path is ~/.claude/projects/<the repository's project key>/drifted.jsonl and which carries session_id and prompt_id.
expected: sessionId.txt is written in the state directory of the repository's project, and no state directory keyed by the working directory is created.

## end_through_hook_opens_diff
scenario: startServer is called with an onPublish callback that calls showLastTurn. The repository has f.txt containing "one", committed. The hook script runs "begin" and "arm" with a payload naming the session's transcript. f.txt is rewritten to "two". The hook script runs "end".
expected: The vscode.changes command is executed exactly once, with the single resource f.txt.

## focus_takes_advert_back_and_leaves_a_foreign_one
scenario: The server is listening and has written server.json. Another window overwrites server.json with its own advert. readvertise is called. Then the other window overwrites server.json again, and dispose is called.
expected: After readvertise server.json holds this server's advert again. After dispose server.json still holds the other window's advert.

## moving_to_another_project_moves_the_advert
scenario: The workspace folder is repository A and the server is listening. The workspace folders change to [B] and readvertise runs. Then they change to [A, B] and readvertise runs.
expected: After the first readvertise A has no server.json and B's server.json holds this server's advert. After the second, A's server.json holds this server's advert and B has none.

# view
files: src/view.js src/turn/index.js src/turn/collect.js src/store/manifest.js src/store/paths.js src/utils/files.js src/utils/workspace.js

## a_m_d_become_the_right_sides
scenario: keep.txt containing "one" and gone.txt containing "bye" are committed. A turn rewrites keep.txt, creates added.txt, deletes gone.txt and ends. showLastTurn({ force: true }) runs.
expected: The executed command is vscode.changes. For keep.txt the before uri has the scheme "claude-before" and the same path as the after uri, and the after uri is the real file. The entry for added.txt has no before uri. The entry for gone.txt has no after uri.

## each_turn_gets_a_distinct_before_uri
scenario: Two consecutive turns each rewrite f.txt and end. showLastTurn({ force: true }) runs after each.
expected: The before uri of f.txt from the first render and the one from the second render differ as strings.

## provider_serves_the_turn_and_refuses_the_unknown
scenario: A turn rewrites f.txt from "before" to "after" and ends. The before-image file system provider is registered. showLastTurn({ force: true }) runs and yields the before uri of f.txt.
expected: The provider's readFile for that uri returns "before", its stat for that uri reports a size equal to the length of "before", and its readFile for a plain file uri such as file:///nope throws.

## before_image_resolves_without_a_render
scenario: A turn rewrites f.txt from "before" to "after" and ends. No render happens. The provider is registered. A uri is built from the manifest's beforeFile with the scheme "claude-before" and a query equal to the manifest's ts.
expected: The provider's readFile for that uri returns "before".

## emptied_and_deleted_empty_both_render
scenario: gone.txt with empty contents and emptied.txt containing "one" are committed. A turn deletes gone.txt and empties emptied.txt, then ends. The provider is registered. showLastTurn({ force: true }) runs.
expected: Two resources are listed. gone.txt has no after uri; the provider's stat for its before uri reports size 0 and readFile returns empty contents. The provider's readFile for the before uri of emptied.txt returns "one".

## reverted_by_hand_drops_out
scenario: f.txt and g.txt containing "one" are committed. A turn rewrites both to "two" and ends. Then f.txt is rewritten by hand back to "one". showLastTurn({ force: true }) runs.
expected: The only resource listed is g.txt.

## move_renders_as_rename
scenario: old/f.txt is committed. A turn renames it to new/f.txt and ends. showLastTurn({ force: true }) runs.
expected: Exactly one resource is listed. Its resource uri is the new path. Its before uri's path is the old path and its after uri's path is the new path.

## superseded_before_image_is_refused
scenario: A turn rewrites f.txt and ends; the provider is registered; a render yields the before uri U of f.txt. A second turn rewrites f.txt again and ends.
expected: The provider's readFile for U throws.

## only_additions_still_render
scenario: seed.txt is committed. A turn creates added.txt and ends. showLastTurn({ force: true }) runs.
expected: The resources listed are exactly added.txt.

## finished_diff_is_kept
scenario: A turn rewrites f.txt and ends. showLastTurn({ force: true }) runs.
expected: The commands executed, in order, are exactly vscode.changes and then workbench.action.keepEditor.

## empty_diff_and_running_look_stay_previews
scenario: f.txt is committed and no turn has run. showLastTurn({ force: true }) runs. Then a turn begins and arms, f.txt is rewritten, and showLastTurn({ force: true }) runs again.
expected: In both cases the only command executed is vscode.changes; workbench.action.keepEditor is never executed.

# workspace
files: src/turn/index.js src/turn/capture.js src/turn/collect.js src/utils/watch.js src/utils/files.js src/utils/git.js src/store/paths.js src/store/manifest.js

## two_repositories_one_manifest
scenario: Two repositories A and B are the workspace folders, each with f.txt committed. A turn keyed by A rewrites f.txt in both and ends.
expected: manifest.json for A's project lists two changes.

## outside_file_is_captured
scenario: ~/outside/notes.md exists containing "before" and lies outside every workspace folder. A turn begins and arms, then a further "arm" carries tool_input.file_path naming that file. notes.md is rewritten to "after" and the repository's f.txt is rewritten. "end" runs.
expected: manifest.json lists f.txt and notes.md.

## outside_file_created_has_no_before_image
scenario: ~/created/notes.md does not exist. A turn begins and arms, then a further "arm" carries tool_input.file_path naming that path. The file is then created containing "new" and f.txt is rewritten. "end" runs.
expected: manifest.json lists f.txt and notes.md, and no image for notes.md exists in the beforeImages directory.

## outside_binary_is_skipped
scenario: ~/outside/pic.png exists with bytes that include a zero byte. A turn begins and arms, a further "arm" names that file, the file is rewritten with different bytes that include a zero byte, and f.txt is rewritten. "end" runs.
expected: manifest.json lists only f.txt.

## outside_file_is_watched_once
scenario: ~/watched/notes.md exists. A turn begins and arms. Three further "arm" calls follow, with tool_input.file_path naming ~/watched/notes.md, ~/watched/notes.md again, and the repository's own f.txt. Both files are rewritten and "end" runs.
expected: Exactly one file system watcher was created, with a base of the directory ~/watched and a pattern of notes.md, and it is disposed once "end" has run.

## two_projects_do_not_overwrite_each_other
scenario: Repositories A and B each have f.txt committed. A turn keyed by A rewrites A's f.txt and ends; then a turn keyed by B rewrites B's f.txt and ends.
expected: The two projects' manifest.json files are at different paths, and after B's turn the before-image of A's f.txt still exists alongside B's.

## outside_files_come_last_in_tree_order
scenario: ~/zzz-outside/later.md and ~/aaa-outside/earlier.md exist. A turn begins and arms, then "arm" names later.md and then earlier.md. f.txt in the repository and both outside files are rewritten. "end" runs.
expected: The afterFile names in manifest.json are in this order: f.txt, earlier.md, later.md.
