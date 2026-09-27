# Behavior tests

What Turn Diff for Claude Code does, one behavior per test. Each test is a statement about the code as written, and it passes when the statement holds.

Tests are grouped by area. Each test is a heading holding its id in backticks, made of the area and a short name, for example `Capture: Every changed file is listed`, with its statement below it. Where a test states a general rule, its exceptions are covered by other tests in this file.

## Terms

- **Turn**: everything Claude Code does between a prompt and the end of its reply. The extension shows one turn's changes as a single multi-file diff.

- **Baseline**: the contents of every workspace repository, recorded when the turn makes its first tool call that can write. A turn's changes are measured against it.

- **Armed**: a turn is armed from the moment its baseline is taken until it ends.

- **Before-image**: a copy of what a file contained when the turn started, shown as the left side of the diff.

- **Published diff**: the list of a turn's changes together with their before-images, written when the turn ends or when a running turn is looked at. Opening the diff shows the published one. Every publish carries a stamp that identifies it.

- **Look**: asking for the diff while the turn is still running.

- **Project**: the directory a Claude Code session started in. Each project has its own published diff.

- **Advert**: the file through which a VS Code window tells the hook script how to reach it. One window serves a project at a time.

- **Outside file**: a file outside every git repository in the workspace.

- **Editing tool**: an Edit, MultiEdit, Write or NotebookEdit tool call, each of which names the file it is about to change.

## Capture

#### `Capture: Every changed file is listed`
Text files inside a workspace repository that the turn modified, created or deleted appear in the turn's diff. A modified or deleted file has a before-image holding what it contained when the turn started; a created file has none.

#### `Capture: A file changed and changed back is not listed`
A file the turn changed and then restored to its original contents does not appear in the diff. Only files whose contents differ from the start of the turn are listed.

#### `Capture: A created empty file is listed with no before-image`
An empty file created by the turn appears in the diff as an added file, with no before-image.

#### `Capture: A deleted empty file keeps an empty before-image`
An empty file deleted by the turn appears in the diff as a deleted file, with a before-image that exists and is empty.

#### `Capture: Binary files are left out`
A changed file counts as binary when its old or its new contents have a zero byte within the first 8000 bytes. Binary files are left out of the diff, and text files changed in the same turn are listed as usual.

#### `Capture: Untracked files over one megabyte are ignored`
Untracked files larger than one megabyte are ignored: if the turn changes one, nothing is listed for it. Tracked files are included whatever their size.

#### `Capture: A same-size edit is seen a second later`
An edit is detected even when it leaves the file the same size, lands within the same second the file was last committed, and the turn only ends a second or more later. That is the situation in which git would otherwise trust the file's unchanged size and timestamp and skip re-reading it.

#### `Capture: A move is one change`
A file the turn moved appears in the diff as one change naming both its old and its new path, not as a deletion beside an addition. This holds for a file that was only moved and for one that was moved and had a small part of it edited.

#### `Capture: A moved file keeps its old contents as the before-image`
For a file the turn moved and edited, the before-image holds what the file contained at its old path when the turn started, so the diff shows the edit.

#### `Capture: Changes follow the order of the explorer`
Changes are listed in the order VS Code's explorer shows files: at every level of the path, folders come before files, and names are compared with a locale-aware comparison that orders numbers by value, so file2 comes before file10. A moved file is placed by its new path.

## Install

#### `Install: Settings with exactly the extension's hooks count as registered`
Claude Code settings that hold exactly the hooks the extension registers count as registered.

#### `Install: Settings with no hooks do not count as registered`
Settings with no hooks at all do not count as registered.

#### `Install: Settings missing one of the events do not count as registered`
Settings that lack the extension's hook for one of its events, for example StopFailure, do not count as registered.

#### `Install: A changed hook entry does not count as registered`
If one of the extension's hooks in the settings differs from what the extension would register now, in its matcher, its timeout or its command, the hooks do not count as registered. The user is then offered the current registration instead of being left with an outdated one.

#### `Install: Other tools' hooks are ignored`
Other tools' hooks in the same settings, whether on the extension's events or on other events, do not affect whether the extension's hooks count as registered. Only the extension's own entries are compared.

## Retention

#### `Retention: A later turn replaces the before-images`
When a later turn publishes its diff, its before-images replace the previous turn's. For a file both turns changed, the before-image afterwards holds what the file contained when the later turn started.

#### `Retention: Ending a turn leaves the advert in place`
Ending a turn and publishing its diff leaves the window's advert in place. Ending a turn clears the turn's own tracking state and replaces the published diff and its before-images, and touches nothing else in the project's state.

#### `Retention: A turn that changes nothing leaves the previous diff`
A turn that changes nothing publishes nothing: the previous turn's diff and before-images stay exactly as they were.

#### `Retention: A new prompt discards an abandoned turn`
A new prompt that arrives while an earlier turn is still armed, for example one the user interrupted, which therefore never got its Stop hook, discards that turn's tracking state. The new turn's changes are measured from the files as they are when it starts, not from the abandoned turn's baseline.

#### `Retention: The same prompt id keeps the baseline`
A prompt-submitted event that carries the running turn's own prompt id, as when a queued message or a finished background command is handed to that turn, does not restart the turn. The turn keeps its baseline, and its diff includes everything it changed before the event.

#### `Retention: A subagent failure does not end the turn`
An end-of-turn event raised from inside a subagent, whose payload carries an agent_id, such as a subagent failing on an API error, does not end the turn it runs in: nothing is published, no diff opens, and the turn keeps its baseline. When the main turn ends, its diff includes everything the turn changed, before and after the subagent's event.

## Running

#### `Running: A running turn shows its changes so far`
Asking for the diff while a turn is still running shows what the turn has changed so far, titled "Changes so far".

#### `Running: Each look brings a running turn up to date`
Each time the diff of a running turn is asked for, the turn's changes are collected afresh, so files changed since the previous look are included.

#### `Running: An interrupted turn is finished and published when asked for`
An interrupted turn gets no Stop hook, so asking for the diff finishes it: when the transcript shows the user interrupted the turn, its changes are published as a finished turn, the diff opens titled "Last turn changes", and the turn is no longer armed.

#### `Running: An interrupted turn stops growing`
Once asking for the diff has finished an interrupted turn, files the user edits by hand afterwards are not added to that turn's diff.

#### `Running: An ended turn is never collected again`
A turn that has ended is a record of what it did: files edited by hand afterwards are not added to its diff.

#### `Running: A running turn with no changes falls back to the last turn`
Asking for the diff while the current turn has not changed anything yet shows the previous turn's diff, titled "Last turn changes".

#### `Running: A turn whose Stop hook never came is published when asked for`
A turn whose Stop hook never arrived, for example because the window was closed just as the turn finished, is published as a finished turn when its diff is next asked for, provided the transcript shows the turn is over.

#### `Running: A paused turn is still running`
A turn counts as over only when the transcript's last message is a reply that stopped for a reason that ends a turn (end_turn, stop_sequence, max_tokens or refusal), or the user interrupting it. A reply that stopped to call a tool, or for any other reason such as pause_turn, leaves the turn running, so its diff is shown as "Changes so far".

#### `Running: A look leaves the turn armed`
Looking at a running turn does not end it. The turn keeps its baseline, and when it ends, its diff includes both what the look showed and everything changed after the look.

#### `Running: A look keeps the outside watchers`
Looking at a running turn keeps watching the files outside the workspace that the turn has named. The watchers are released only when the turn ends.

#### `Running: A look and the end get distinct stamps`
A look at a running turn and the end of that turn a moment later, even within the same second, publish diffs with different stamps.

#### `Running: Only an end that published reports it`
The diff opens at the end of a turn only when the turn published something. A turn that changed nothing reports that it published nothing, so the diff it left alone is not reopened.

## Server

#### `Server: Re-advertising an unchanged window leaves the advert alone`
When a window re-advertises and neither its project nor its port has changed, the advert file is left untouched.

#### `Server: A window with no folders serves the home project`
A window with no folder open advertises under the project of the home directory, which is where Claude Code files a chat started without a folder. When a folder is opened, the advert moves to that folder's project and the home advert is removed, so a window has one advert at a time.

#### `Server: A deleted advert is written again`
If a window's advert is deleted, the window writes it again the next time it re-advertises.

#### `Server: Shutting the server down removes the advert`
Shutting a window's server down removes its advert.

#### `Server: The hook finds the project from the transcript, not the cwd`
The hook script works out the project from the transcript path in the hook payload, which names the directory the session started in. It never uses the current working directory, which follows every cd Claude runs.

#### `Server: A turn ended through the hook opens its diff`
When a turn ends through the hook script and publishes a diff, the window serving the project opens that diff exactly once.

#### `Server: Focus takes the advert back and leaves another window's`
When a window re-advertises, for example on regaining focus, and finds another window's advert for its project, it writes its own again, so the window in front is the one being served. When a window shuts its server down, it removes the advert only if the advert is still the one it wrote; an advert another window has written since is left alone.

#### `Server: Moving to another project moves the advert`
When a window's first folder changes to a different project, its advert moves there and the old project is no longer served by it. Only the first folder decides the project, so adding a second folder after it changes nothing.

## View

#### `View: Added, modified and deleted files get the right sides`
A modified file shows its before-image on the left and the file on disk on the right, with both sides on the same path so the editor does not take it for a rename. An added file has no left side, and a deleted file has no right side.

#### `View: Each turn gets a distinct before-image URI`
A before-image is addressed by a URI that carries the stamp of the diff it belongs to, so when two turns change the same file, its before-image has a different URI in each turn's diff.

#### `View: The provider serves the current turn and refuses the rest`
The before-image provider serves the published diff: for a URI carrying the current stamp, reading returns the before-image's contents and stat reports its size. For any URI it cannot serve, including one without the current stamp, both throw FileNotFound instead of returning empty contents.

#### `View: A before-image resolves without a render`
A before-image can be served straight from the published diff even if the window never rendered that diff, as when VS Code restores a diff tab after a restart.

#### `View: An emptied file and a deleted empty file both render`
An empty file the turn deleted and a file the turn emptied both appear in the diff. The deleted empty file's before-image is served as empty contents of size 0, not as missing, and the emptied file's before-image holds its old text.

#### `View: A file reverted by hand drops out`
When the diff is opened, a file whose contents on disk are identical to its before-image, for example because the user reverted it by hand after the turn, is left out, while the turn's other changes are listed.

#### `View: A move renders as a rename`
A moved file appears as one entry named by its new path, with its two sides on its old and its new path, so the editor shows it as a rename.

#### `View: A superseded before-image is refused`
Once a later turn has published its diff, a before-image URI from the earlier turn is refused with FileNotFound rather than served the later turn's contents.

#### `View: A turn that only adds files still renders`
A turn that only added files still opens with those files listed, even though it wrote no before-images.

#### `View: A finished turn's diff is kept as a tab`
The diff of a finished turn becomes a regular tab right after it opens, so the next preview to open cannot replace it.

#### `View: An empty diff and a look stay previews`
Only a finished turn's diff with at least one change is made a regular tab. An empty diff and a look at a running turn stay preview tabs, which the next look or the finished diff replaces.

## Workspace

#### `Workspace: Two repositories give one diff`
A turn that changes files in two repositories of a multi-root workspace produces one diff listing the changes from both.

#### `Workspace: An outside file is captured`
An outside file that an editing tool names before changing it is captured, and appears in the diff alongside the repository changes.

#### `Workspace: A created outside file has no before-image`
An outside file that an editing tool names before it exists, and that the turn then creates, appears in the diff as an added file, with no before-image.

#### `Workspace: A binary outside file is left out`
A binary outside file that an editing tool named is left out of the diff, while a text file changed in the same turn is listed.

#### `Workspace: An outside file is watched once`
When an editing tool first names a file outside the workspace, the extension starts watching that file, so VS Code notices Claude's writes to it. Naming the same file again adds no second watcher, files inside the workspace get no watcher, and the watchers are released when the turn ends.

#### `Workspace: Two projects do not overwrite each other`
Each project has its own published diff and before-images: a turn in one project leaves another project's published diff intact.

#### `Workspace: Outside files come last, in tree order`
Outside files are listed after the repository changes, and among themselves in tree order rather than in the order the tools named them.
