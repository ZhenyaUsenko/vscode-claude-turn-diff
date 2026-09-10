# Technical notes

Why the code is shaped the way it is. Most of this was found by testing, and none of it can be read off the source.

## How a turn flows

Claude Code runs four hooks, all pointing at one script:

- `UserPromptSubmit` runs `begin`.

- `PreToolUse` on `Edit`, `Write`, `MultiEdit`, `NotebookEdit` and `Bash` runs `arm`.

- `Stop` and `StopFailure` run `end`.

The script hands each payload to the VS Code window serving the project, and the extension does the work:

- `begin` clears the state a turn that never ended left behind.

- `arm` snapshots every git repository in the workspace the first time it runs in a turn, and copies aside any file a tool names outside those repositories.

- `end` snapshots again, works out what changed, writes the before-images and the manifest, and opens the diff.

All of a project's state sits in `~/.claude/turn-diff/<project>/`:

```
server.json      which window serves the project
sessionId.txt    the chat the armed turn belongs to
promptId.txt     the prompt the armed turn belongs to
snapshots.tsv    one row per repository: repoDir, gitDir, before tree
touchList.txt    files outside every repository that a tool named
touchCopies/     copies of those files as they were
beforeImages/    the published before-images
manifest.json    the published diff
```

The four files after the advert plus `touchCopies/` are the armed state. They exist while a turn is running and are cleared when it ends. The last two are the published turn.

## The hook is a thin client

Claude Code runs the hook before every write-capable tool call, so it is a hot path. The script does no work of its own. It finds the window serving the project and hands the payload over a loopback socket, and all capture logic runs inside the extension.

The request is two lines, and the reply is `ok\n` or `err\n`:

```
<token>\t<mode>\t<project>\n
<raw hook payload json>\n
```

The hook waits for the reply. `arm` has to finish snapshotting before the tool it precedes is allowed to run.

The script is plain bash and spawns nothing. A `/dev/tcp` round trip costs about 3 ms, less than starting any interpreter. The port and token are pulled out of the advert with parameter expansion for the same reason, not with `jq`. If no window serves the project the connection fails and the hook exits 0, because nothing could render the result anyway.

## The project key comes from the transcript path

Claude Code files a session under the directory it started in:

```
~/.claude/projects/<key>/<sessionId>.jsonl
```

The hook reads the key out of `transcript_path`, which every payload carries. It must never derive it from `$PWD`. That follows every `cd` Claude runs, so a turn that changed directory sent `begin` and `arm` to one project and `end` to another. The turn's state ended up under a key no window was serving, and the diff silently never appeared. It looked intermittent because only long, `cd`-heavy turns hit it.

For the same reason nothing below the wire boundary sees a directory. `turn/` and `store/` take a key, and `getProjectKey()` is called only from `getCurrentProject()`, the one place the extension turns its own surroundings into a key.

That function falls back to the home directory when no folder is open. VS Code's terminal starts in the home directory for such a window, so that is where Claude Code files the chat, and where the window has to advertise and look. It is a guess at a default, not something observable: a `terminal.integrated.cwd` override, or a `claude` started from elsewhere, files the chat under a key the window never checks.

## Arming a turn

### Two capture mechanisms

Neither covers everything on its own:

- **Tree snapshots** catch anything a shell command does inside a git worktree: `rm`, `sed`, a formatter, package-lock churn.

- **Per-file capture** catches edits outside every repository, but only for paths an `Edit` or `Write` tool names.

A shell command writing outside every repository is caught by neither.

The repository snapshot happens once per turn. Later `arm` calls fall through to the cheap per-file branch, which is what keeps a turn with dozens of tool calls affordable.

### What the first arm records

The `arm` that takes the snapshot also writes `sessionId.txt` and `promptId.txt`. Nothing else in the project directory says which chat or which prompt the armed turn belongs to, and both are needed later: the session id locates the transcript, and the prompt id tells a new prompt from one injected into the running turn. Writing them on the cold path keeps them off the per-tool path.

### A prompt is not always a new turn

`begin` runs on `UserPromptSubmit`, and Claude Code raises that event for more than a prompt you type. A message queued while it works, a background command finishing, or any other notification is handed to the running turn through the same event. Each arrives with the running turn's `prompt_id`, and the tool calls that follow keep that id. A genuine prompt carries a fresh one.

So `begin` clears the armed state only when its prompt id differs from the one in `promptId.txt`. Clearing on every `UserPromptSubmit` re-took the baseline at the next `arm`, and everything the turn had done before that point was missing from its diff. A turn that started a rebuilt server in the background and kept editing lost every edit made before the command finished, and showed only the files it touched afterwards.

`prompt_id` is a common hook field from Claude Code 2.1.196 on. It is absent only before a session's first prompt, which no hook of ours runs before. A `source` field naming who injected the prompt is rolling out too, but it may be absent for now, and it would not tell a queued message of yours from a new prompt anyway.

## Snapshots

A worktree is snapshotted to a dangling tree object by copying `.git/index` aside and pointing `GIT_INDEX_FILE` at the copy. The real staging area is never touched.

Each snapshot gets its own temporary directory for the copy. A look at a running turn snapshots while `arm` may be snapshotting too, because the server handles each hook request independently. Two snapshots sharing one path overwrite each other's index mid-read, `write-tree` returns nothing for the loser, and that repository silently drops out of the turn.

The copy must keep the source's mtime. Git decides whether an index entry needs its content re-read by comparing the entry's mtime with the index file's own. A copy with a fresh timestamp makes every entry look safely older, so git trusts its cached stat data. The symptom was an edit that left a file the same size, made in the same second as the last commit, going unreported, and only when the snapshot happened a second or more later. That is why it showed up as a flaky test.

Untracked files over `MAX_UNTRACKED_BYTES` are excluded from both snapshots, so they cancel out and never appear. Tracked files are never size-filtered: git only re-hashes those whose stat info changed, whereas untracked files are hashed from scratch on every snapshot.

## Ending a turn

### Collecting

Changes are listed with `diff --name-status -z -M`, so each entry carries the path a file had and the path it has. Rename detection is on by default in git, and `--name-only` prints only a rename's destination. Listed that way, a moved file had no counterpart in the before tree and was recorded as an addition, while its deletion went unmentioned. A move plus an edit looked like a new file.

An entry whose contents are unchanged is dropped only when its two paths match as well. Otherwise a pure rename would vanish as "not a real change". Detection is still git's heuristic, not a record of what happened: two files that start out identical can pair the wrong way, and a heavily rewritten move arrives as a delete beside an add, the same as in staged changes.

A repository's before-images are read with one `git cat-file --batch`. Spawning git costs about 10 ms, so reading them one file at a time would make ending a turn scale with the number of files changed; fifty files would spend half a second on process startup alone. As it is, a turn spawns the same handful of git processes whatever it touched: nine, or up to eleven when there are untracked files to stage. Input is NUL-terminated (`-z`) so paths containing newlines survive, matching the `-z` used to list them.

Binary files are skipped rather than listed. The multi-diff editor resolves both sides through the text model service, so a binary entry cannot render: it would be counted in the title and missing from the view. Both sides are sniffed for a NUL byte within `BINARY_SNIFF_BYTES`, git's own heuristic, at the one point every entry passes through. Detecting them per collector left the other collector blind: a binary outside every repository was counted in the title and then rendered as nothing.

Everything is collected in memory before anything on disk moves. That is what makes a turn that changed nothing free: it publishes nothing, so it clears nothing, and the previous diff survives. `arm` fires on `Bash`, so a turn that runs one command and changes nothing is ordinary. Nothing is held that was not held already, since `readBlobContents` reads a whole repository's before-images in one batch.

### Publishing

Everything a project needs sits directly in its own directory: the armed state, one `beforeImages/`, one `manifest.json`. There is no per-chat or per-turn nesting, because only one diff is ever shown.

Two chats running at once in one project therefore share a turn. The second reuses the first's baseline and produces nothing of its own. Per-chat state would not make them independent anyway: a snapshot covers the whole workspace, so a parallel chat's edits land in the other's diff regardless.

Three things then happen in an order that matters:

```
remove manifest.json      nothing resolves; a stale tab keeps what it has
clear and write beforeImages/
rename the new manifest into place
```

Without the removal first there is a window where a superseded tab's stamp still matches the old manifest while the bytes underneath have already been replaced, and it would be handed the new turn's before-image for the old turn's diff. Removing it costs nothing: nothing watches the file, and a read landing in that window finds no manifest rather than the wrong bytes.

`beforeImages/` is recreated even when every change is an addition and nothing is written into it. Its absence means the images were reclaimed; a missing file inside it means there was no before. Without that, a reclaimed turn would render every modified file as newly created.

The manifest is written to a temporary file and renamed into place. The rename is atomic, so a read landing mid-publish sees the old manifest or the new one, never half of one. The before-image provider reads it on every request.

`running` on the manifest records what the turn was when it was published, so the editor's title describes the diff on screen rather than the state of the moment. Stamps are milliseconds: a look and the end of the same turn usually fall within one second, and at second granularity they would share a `ts`, so the finished diff would read as already rendered and never open.

Nothing watches the manifest. The window that publishes is the window that renders. A turn reports `{ published: true }` back through the request it arrived on and the extension opens the diff, while the command publishes and renders in one go. That report is what keeps a turn that changed nothing from reopening the diff it left alone. Watching the file instead would decouple the two at the cost of waiting about 12 ms for an event carrying news the publisher already had. The server takes a callback rather than calling the renderer, so it stays a transport: it knows a turn published, not what anyone does about it.

There is no sweep and nothing ages out. A turn's state is replaced by the next turn's, so a project directory holds at most one turn's worth.

## Finishing a turn on demand

A manifest only exists once a turn has ended, and a turn can end without `end` ever running. Claude Code runs no `Stop` hook on a turn you interrupt. A turn that ends cleanly reaches nothing if the window was closed or reloading at that moment, if the hook timed out, or if `end` threw. In each case the snapshot is stranded, and the next `begin` discards the work unseen.

So asking for the diff runs `end` over anything still armed before it renders. `endTurn` publishes whatever the armed turn has done so far, and tears the turn down, clearing the armed state and releasing its watchers, only when the transcript says the turn is over. A running turn keeps its baseline, so the rest of it is still captured and its real `Stop` publishes again on top.

Everything else follows. A running turn is collected afresh every time it is asked for, because nothing remembers the last look. A turn that is over was collected when it was torn down, so its diff stops growing there, and files you touch by hand afterwards cannot wander into it. A turn that ended normally cleared `snapshots.tsv`, so there is nothing armed to collect. A running turn that has changed nothing publishes nothing, which leaves the previous turn and its title alone.

Only an explicit request takes this path. Rendering after `end` does not collect again, since the armed state is gone by then. A turn is published by the hook that ends it or by someone asking to see it, and by nothing else.

### Reading the end of a turn from the transcript

The last 64 KB of the transcript is scanned backwards to the last `user` or `assistant` entry, and that entry decides. Real transcripts grouped by `promptId`, which only user entries carry and which marks the prompt boundary, show that every turn ends in one of two ways:

- An assistant entry whose `stop_reason` is terminal. This is an Anthropic API field, not a Claude Code internal. `tool_use` is the mid-turn case: stopping to call a tool is how a turn continues.

- A user entry starting with `[Request interrupted by user`, one of the two markers Claude Code writes on Esc. Claude Code counts its own interruptions by testing for the same prefix.

Terminal reasons are an allowlist, not "anything but `tool_use`". `pause_turn` exists in the API and means carry on, so a reason we have not seen must read as running.

Scanning backwards rather than reading the last line matters twice. The interrupt marker is not last: `queue-operation`, `last-prompt` and `file-history-snapshot` land after it. And a rejected tool records the same `toolDenialKind` an interrupt does while the turn carries on, so a later assistant entry is found first and the turn reads as running. Sidechain entries are skipped, or a running subagent would hide the main chain's ending.

Anything unreadable means not over. Wrongly finishing a running turn would clear its baseline and leave the real `Stop` with nothing to publish; wrongly leaving one alone only means it is collected again next time. A turn whose final entry is larger than the 64 KB window reads as running, which is what such an entry almost always means.

What this cannot see is a turn that died without writing anything: the window killed, a crash, the connection dropping mid-stream. No assistant entry is ever written with a missing `stop_reason`, so such a turn leaves the same trace as one still thinking, and only elapsed time separates them. Those are cleared by the next `begin`.

## Rendering

Status is not stored. It is derived when the diff opens, from two `existsSync` calls: no before-image is an addition, no after file is a deletion, both present is a modification, and differing paths are a rename. A stored status froze what the turn did at the moment it ended while the tree moved on: a file modified and then deleted by hand rendered with a right side that no longer existed, and one deleted and then recreated by hand still rendered as a deletion.

Two things keep that derivation unambiguous. An addition writes no before-image, so an empty image can only mean the file was already empty. And `beforeImages/` exists whenever a turn was published, so a missing directory means the images were reclaimed while a missing image inside it means there was no before.

Changes that no longer represent anything renderable drop out at render time: a file reverted by hand, or one whose sides have both gone.

The multi-diff editor decides a file was renamed by comparing `originalUri.path !== modifiedUri.path`. Pointing `original` straight at the before-image on disk struck through every filename and stamped it `R`. The before side is served through a scheme that keeps the real path verbatim, so the two sides differ only where a file actually moved, which is exactly when a rename should show.

The turn's stamp goes in the URI query, and the provider serves an image only while the stamp matches the published manifest. That gives every turn a distinct URI. Without it the URI would be the file's own path with the scheme swapped, identical every turn, and VS Code may serve the text model it cached for the previous turn, which renders as no change at all. Since every turn writes into the same `beforeImages/`, that comparison is also the only thing keeping a superseded tab off the new turn's contents.

The provider answers from the manifest, not from anything a render left behind. VS Code restores the multi-diff editor across a restart, but the extension host that rendered it is gone, so a cache filled at render time no longer holds the before-images. Every left side came back empty while the `A`/`M`/`D` badges, restored with the editor, still looked right.

A URI the provider cannot serve throws `FileNotFound` rather than resolving to empty. A file-backed model is re-read, and `TextFileEditorModel` keeps what it already has when that re-read reports this code (`isResolved() && result === FILE_NOT_FOUND` returns early). So a diff left open from an earlier turn stays readable after a later turn has replaced the manifest. Empty bytes are a valid answer and the editor believes them: the left side blanks and the whole file reads as newly added.

Before-images are served by a file system provider rather than a `TextDocumentContentProvider`, with `onFileSystem:claude-before` as an activation event. A restored diff that is the active tab asks for its content while the window is still starting, before `onStartupFinished` activates anything, and nothing in the workbench activates an extension on behalf of a text content provider. Resolution failed outright: every modified entry rendered as nothing while the title kept counting it, and waiting a few seconds before switching to the tab worked. The file service is the one resolver that waits. It fires `onWillActivateFileSystemProvider`, joins the activation promise, and only then looks for a provider.

The provider implements the entire interface, including the write methods that `isReadonly` makes unreachable. `_validateFileSystemProvider` type-checks `watch`, `stat`, `readDirectory`, `createDirectory`, `readFile`, `writeFile`, `delete` and `rename` at registration, and subscribes to `onDidChangeFile` without a check. Any of them missing throws inside `activate`, which takes down the whole extension, so the symptom is every command reporting itself as not found. The file service refusing writes on the readonly capability happens far later and is no reason to leave them out.

Firing `onDidChange` at registration is the tempting fix for a restored editor that shows nothing, and it makes matters worse: it drops every modified entry and leaves only the added file, the one with no left side to resolve. The model is not stale, it has never resolved.

## Watching files outside the workspace

VS Code only watches what is inside the workspace, so its in-memory copy of a file outside it lags behind disk until the window is refocused. Claude Code opens the document to show its own inline diff and then writes to disk directly, so the editor keeps the pre-edit text. That is exactly what the before-image holds, and the diff renders as no change at all.

Registering a `FileSystemWatcher` on such a path makes the file service report the write, which is what makes the editor reload. It has to happen in `arm`, before the tool writes. Doing it at render time is too late for the first edit of each file.

Watchers are released when a turn ends, and only then. A look at a running turn publishes without tearing the turn down, so the files it is still editing stay watched.

## Advertising

A window writes `server.json` for the project of its first workspace folder, the way Claude Code advertises its own IDE server in `~/.claude/ide`. The file is `0600` and holds a token. The server binds `127.0.0.1` on an ephemeral port and rejects any request whose token does not match.

One advert per project means one window serves it, and a window returning from a crash simply overwrites whatever was left behind. VS Code will not open two windows on the same folder; it focuses the one already open. Two windows on one project arise only when two multi-root workspaces share a first folder, or when two editors that both run this extension are open on it.

A window advertises again whenever it takes focus, so the window you are looking at is the one being served. That is why both writing and removing the advert compare its contents first. A window skips the write when the file is already its own, and leaves the file alone on the way out when another window has since claimed it. Without the second check, closing a window would remove an advert it no longer owned and leave the other window running but unreachable.

The advert is written to a temporary file and renamed into place, like the manifest. The hook reads it with one shell redirection, so a write that truncated first could let it read an empty file, parse no port, and exit having done nothing.

## Settings

`hooksMatchSpec` compares our hooks against `HOOK_SPEC` exactly rather than checking that something of ours is present. Changing a matcher, a timeout or a command has to re-prompt, or everyone keeps running whatever they registered first.

`end` is registered for `StopFailure` as well as `Stop`. A turn cut short by an API error never reaches `Stop`, and its snapshot would sit unclaimed until the next prompt discarded it.

`arm` matches every tool that can write, including `Bash`, because a shell command is exactly what per-file capture cannot see coming.

## Naming

One name per entity, one entity per name. A suffix says what a value is, so nobody has to read an assignment to know whether a string is a path, and whether that path is absolute:

- `*File`: an absolute path to a file. `manifestFile`, `beforeImageFile`, `targetFile`, `copiedFile`.

- `*Dir`: an absolute path to a directory. `projectDir`, `repoDir`, `gitDir`, `beforeImagesDir`.

- `*Path`: a path that is relative, or whose kind is not known there. `beforePath` as git reports it, `targetPath` in `removeRecursive`.

- `*Name`: a bare name with no separators. `fileName`.

- `*Uri`: a `vscode.Uri`. `resourceUri`, `beforeUri`, `dirUri`.

- `*Contents`: bytes or text. `beforeContents`, `blobContents`.

The `Path`/`File` boundary carries real weight. Git reports repo-relative paths while the manifest holds absolute ones, so without the suffix, whether a value still needs joining to its repository would depend on which function you were reading. `join(repoDir, beforePath)` yielding a `beforeFile` is the visible seam between the two. Nothing carries the word "relative", because the `File` suffix already says the other thing.

Some words mean exactly one thing each. `change` is a manifest record, `snapshot` is a `snapshots.tsv` row, `blob` is git object content and never our own copy of a file, `image` is a published before-image. A repository root is a `repoDir`, never `repository`, `repo` or `root`. `workspaceDirs` holds our own path strings, never VS Code's `WorkspaceFolder` objects.

Verbs follow the return type: `read*` gives contents, `get*` gives an attribute or a derived value, `list*` gives a collection. `readFile`, `getFileSize`, `listRepos`.

Nothing outside `utils/files.js` calls an fs read that can throw, so callers branch on a value instead of wrapping every read. A failure is `undefined` for a single value and `[]` for a list.

Names we do not own are left alone: the file system provider's method names, `fsPath`, `extensionPath` and `workspace.workspaceFolders` from VS Code, and `file_path`, `notebook_path`, `transcript_path`, `session_id` and `prompt_id` from the hook payload.

Everything else is imported by name, builtins with the `node:` prefix, and nothing is imported as a module namespace. Each file then declares exactly what it touches, which is what makes sweeping for unused imports worth doing. `assert` in the tests is the one default import left, because a bare `strictEqual(...)` says too little about where it came from. A name is aliased only where the bare one loses its meaning at the use site: `sep as PATH_SEPARATOR` and `relative as getRelativePath`.
