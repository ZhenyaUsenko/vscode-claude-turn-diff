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

- Outside changes are listed after repository changes

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

- A prompt submitted in the running turn leaves the baseline untouched

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

- A window adversises under the first project's folder

- An empty window advertises under the home directory

- Moving to another project removes the old advert

- Moving to another project writes the new advert

- Refocussing a window writes the advert if the current one is different or missing

- Shutting down a server removes its own advert

- Shutting down a server leaves a foreign advert untouched

- The hook script takes the project name from the transcript path

- When a diff is published, the window serving the project opens that diff exactly once

## View

- A modified or deleted file shows its before-image on the left side of the diff

- A modified or added file shows the file on disk on the right side of the diff

- A deleted file shows nothing on the right side of the diff

- An added file shows nothing on the left side of the diff

- Each diff addresses the same before-image path by a distinct URI

- Before-image provider shows the real file size

- Before-image provider throws an error for a URI it cannot find

- Before-image provider answers each request from the published diff on disk

- A before-image that exists and is empty is served

- A before-image from an old diff is refused with an error

- A file restored to its original contents does not appear in the diff

- The diff of a finished turn is opened as a persistent tab

- Asking for a diff mid turn openes a preview tab

- Asking for an empty diff openes a preview tab

## Workspace

- Changes from every workspace repository appear in the diff

- An outside file named by an editing tool and changed appears in the diff

- Outside files are watched while the turn is running

- Only one watcher per file is created

- The watchers are released when the turn ends

- Workspace repository files are not watched

- Each project has its own published diff
