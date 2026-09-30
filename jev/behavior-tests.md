# Behavior tests

What Turn Diff for Claude Code does, one behavior per test. Each test is a statement about the code as written, and it passes when the statement holds.

Tests are grouped by area. Each test is a heading holding its id in backticks, made of the area and a short name, for example `Capture: Every changed file is listed`, with its statement below it. Where a test states a general rule, its exceptions are covered by other tests in this file.

## Terms

- **Turn**: everything Claude Code does between a prompt and the end of its reply. The extension shows one turn's changes as a single multi-file diff

- **Baseline**: the contents of every workspace repository, recorded when the turn makes its first tool call that can write. A turn's changes are measured against it

- **Armed**: a turn is armed from the moment its baseline is taken until it ends

- **Before-image**: a copy of what a file contained when the turn started, shown as the left side of the diff

- **Published diff**: the list of a turn's changes together with their before-images, written when the turn ends or when a running turn is looked at. Opening the diff shows the published one. Every publish carries a stamp that identifies it

- **Look**: asking for the diff while the turn is still running

- **Project**: the directory a Claude Code session started in. Each project has its own published diff

- **Advert**: the file through which a VS Code window tells the hook script how to reach it. One window serves a project at a time

- **Outside file**: a file outside every git repository in the workspace

- **Editing tool**: an Edit, MultiEdit, Write or NotebookEdit tool call, each of which names the file it is about to change

## Capture

- A file the turn modified, created or deleted appears in the diff

- An empty file the turn created or deleted appears in the diff

- A modified or deleted file has a before-image holding what it contained when the turn started

- A created file has no before-image

- A file the turn changed and then restored to its original contents does not appear in the diff

- Binary files are left out of the diff

- Untracked files larger than one megabyte are left out of the diff

- Tracked files appear in the diff regardless of their size

- An edit that keeps a file the same size, made within the same second as the last commit, appears in the diff even when the snapshot happens a second or more later

- A file the turn moved appears in the diff as one change naming both paths

- A file the turn moved with a small part of it edited appears in the diff as one change naming both paths

- A moved file has a before-image holding what it contained when the turn started

- Changes are listed in the same order the explorer's tree shows them

- The order of a moved file is determined by its new path

## Install

- Settings that hold exactly the hooks the extension registers count as registered

- Settings that lack one of the extension's hooks do not count as registered

- If one of the extension's hooks in the settings differs from the spec, the hooks do not count as registered

- Other tools' hooks on any event do not affect whether the extension's hooks count as registered

## Retention

- Publishing a turn replaces the old before-images

- Publishing a turn leaves the advert in place

- A turn that changed nothing leaves the published diff untouched

- A new turn discards the armed state

- A propmt submitted in the running turn leaves the baseline untouched

- A subagent raising an API error is ignored

## Running

- Asking for a diff mid turn shows what the turn has changed so far

- Asking for a diff mid turn collects the changes each time

- Asking for a diff mid turn keeps it armed and leaves the baseline untouched

- Asking for a diff mid turn keeps watching outside files

- Asking for a diff mid turn that changed nothing shows the previous diff

- Asking for a diff ends and publishes an interrupted turn or a turn whose Stop hook never arrived

- When a turn ends, its changes are never recollected again

- Ending a turn a moment after asking for a diff publishes a diff with a different stamp

- A turn that changed nothing does not open a diff

## Server

- Re-advertising in unchanged workspace leaves the advert untouched

- An emty window advertises under the home directory

- If an advert is removed, the window writes it again when it re-advertises

- Shutting down a server removes its advert

- The hook script takes the project name from the transcript path

- When a diff is published, the window serving the project opens that diff exactly once






- When a window re-advertises and neither its project nor its port has changed, the advert file is left untouched.

- A window with no folder open advertises under the project of the home directory, which is where Claude Code files a chat started without a folder. When a folder is opened, the advert moves to that folder's project and the home advert is removed, so a window has one advert at a time.

- If a window's advert is deleted, the window writes it again the next time it re-advertises.

- Shutting a window's server down removes its advert.

- The hook script works out the project from the transcript path in the hook payload, which names the directory the session started in. It never uses the current working directory, which follows every cd Claude runs.

- When a turn ends through the hook script and publishes a diff, the window serving the project opens that diff exactly once.

- When a window re-advertises, for example on regaining focus, and finds another window's advert for its project, it writes its own again, so the window in front is the one being served. When a window shuts its server down, it removes the advert only if the advert is still the one it wrote; an advert another window has written since is left alone.

- When a window's first folder changes to a different project, its advert moves there and the old project is no longer served by it. Only the first folder decides the project, so adding a second folder after it changes nothing.

## View

- A modified file shows its before-image on the left and the file on disk on the right, with both sides on the same path so the editor does not take it for a rename. An added file has no left side, and a deleted file has no right side.

- A before-image is addressed by a URI that carries the stamp of the diff it belongs to, so when two turns change the same file, its before-image has a different URI in each turn's diff.

- The before-image provider serves the published diff: for a URI carrying the current stamp, reading returns the before-image's contents and stat reports its size. For any URI it cannot serve, including one without the current stamp, both throw FileNotFound instead of returning empty contents.

- A before-image can be served straight from the published diff even if the window never rendered that diff, as when VS Code restores a diff tab after a restart.

- An empty file the turn deleted and a file the turn emptied both appear in the diff. The deleted empty file's before-image is served as empty contents of size 0, not as missing, and the emptied file's before-image holds its old text.

- When the diff is opened, a file whose contents on disk are identical to its before-image, for example because the user reverted it by hand after the turn, is left out, while the turn's other changes are listed.

- A moved file appears as one entry named by its new path, with its two sides on its old and its new path, so the editor shows it as a rename.

- Once a later turn has published its diff, a before-image URI from the earlier turn is refused with FileNotFound rather than served the later turn's contents.

- A turn that only added files still opens with those files listed, even though it wrote no before-images.

- The diff of a finished turn becomes a regular tab right after it opens, so the next preview to open cannot replace it.

- Only a finished turn's diff with at least one change is made a regular tab. An empty diff and a look at a running turn stay preview tabs, which the next look or the finished diff replaces.

## Workspace

- A turn that changes files in two repositories of a multi-root workspace produces one diff listing the changes from both.

- An outside file that an editing tool names before changing it is captured, and appears in the diff alongside the repository changes.

- An outside file that an editing tool names before it exists, and that the turn then creates, appears in the diff as an added file, with no before-image.

- A binary outside file that an editing tool named is left out of the diff, while a text file changed in the same turn is listed.

- When an editing tool first names a file outside the workspace, the extension starts watching that file, so VS Code notices Claude's writes to it. Naming the same file again adds no second watcher, files inside the workspace get no watcher, and the watchers are released when the turn ends.

- Each project has its own published diff and before-images: a turn in one project leaves another project's published diff intact.

- Outside files are listed after the repository changes, and among themselves in tree order rather than in the order the tools named them.
