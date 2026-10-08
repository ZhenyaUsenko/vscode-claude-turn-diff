# Technical notes

Why the code is shaped the way it is. Most of this was found by testing, and none of it can be read off the source.

## How a turn flows

Claude Code runs four hooks, all pointing at one script:

- `UserPromptSubmit` runs `begin`.

- `PreToolUse` on `Edit`, `Write`, `MultiEdit`, `NotebookEdit` and `Bash` runs `arm`.

- `Stop` and `StopFailure` run `end`.

The script hands each payload to the VS Code window serving the project, and the extension does the work:

- `begin` clears whatever a turn left armed, unless that turn belongs to the same chat and was not interrupted.

- `arm` snapshots every git repository in the workspace the first time it runs in a turn, and copies aside any file a tool names outside those repositories.

- `end` snapshots again, works out what changed, writes the before-images and the manifest, and opens the diff. While background agents are still working it does nothing, and after an API error it publishes the turn as still running.

All of a project's state sits in `~/.claude/turn-diff/<project>/`:

```
server.json      which window serves the project
sessionId.txt    the chat the armed turn belongs to
snapshots.tsv    one row per repository: repoDir, gitDir, before tree
touchList.txt    files outside every repository that a tool named
touchCopies/     copies of those files as they were
beforeImages/    the published before-images
manifest.json    the published diff
```

The three files after the advert plus `touchCopies/` are the armed state. They exist while a turn is running and are cleared when it ends. The last two are the published turn.

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

A workspace folder that is not a git repository counts as outside: files Claude edits directly are captured per file, and what a shell command changes there is not seen. Git could snapshot such a folder through a git dir of ours kept elsewhere, without touching the folder, but a plain folder has no `.gitignore` to fence anything off, so the first snapshot would hash whatever the folder holds — a `node_modules` in it means seconds inside `arm` and a pile of git objects that only we would ever reclaim. A repository freshly created with `git init` behaves the same way until its first `git add` or commit, since it has no index to copy yet.

The repository snapshot happens once per turn. Later `arm` calls fall through to the cheap per-file branch, which is what keeps a turn with dozens of tool calls affordable.

### What the first arm records

The `arm` that takes the snapshot also writes `sessionId.txt`. Nothing else in the project directory says which chat the armed turn belongs to, and it is needed twice later: it locates the transcript, and it tells a prompt in the same chat from one in another. Writing it on the cold path keeps it off the per-tool path.

### A prompt is not always a new turn

`begin` runs on `UserPromptSubmit`, and Claude Code raises that event for more than a prompt you type. A message queued while it works and a background command finishing are handed to the running turn through it. A background agent's report wakes a main agent that stopped to wait for it. And a turn cut off by closing the window is resumed when the window reopens, with a hidden prompt Claude Code writes itself, "Continue from where you left off." (`isMeta`). Clearing the armed state on any of these re-took the baseline at the next `arm`, and everything the turn had done before that point was missing from its diff.

So `begin` keeps what the same chat left armed, and clears it in two cases only: the prompt comes from another chat, which starts from its own baseline since the old one may be hours old, or the transcript shows you interrupted the last turn. The prompt id cannot make this call. A queued message keeps the running turn's id, but a resumed turn and an agent's report each arrive with a new one, exactly as a prompt of yours does.

The price is a turn whose `Stop` never reached the extension, because the window was closed or reloading just as it finished, or the hook timed out. Nothing tells it apart from a turn waiting for its agents, so your next prompt in that chat carries it on, and its work lands in that prompt's diff.

## Snapshots

A worktree is snapshotted to a dangling tree object by copying `.git/index` aside and pointing `GIT_INDEX_FILE` at the copy. The real staging area is never touched.

Each snapshot gets its own temporary directory for the copy. A look at a running turn snapshots while `arm` may be snapshotting too, because the server handles each hook request independently. Two snapshots sharing one path overwrite each other's index mid-read, `write-tree` returns nothing for the loser, and that repository silently drops out of the turn.

The copy must keep the source's mtime. Git decides whether an index entry needs its content re-read by comparing the entry's mtime with the index file's own. A copy with a fresh timestamp makes every entry look safely older, so git trusts its cached stat data. The symptom was an edit that left a file the same size, made in the same second as the last commit, going unreported, and only when the snapshot happened a second or more later. That is why it showed up as a flaky test.

An untracked file is staged only if it looks like text, by the same NUL test collect applies to every entry. Untracked files have no entry in the index's stat cache, so git reads and hashes each of them from scratch at every snapshot, where a tracked file is re-hashed only when its stat changed. A binary can never render, so hashing one would be pure cost: a 20 MB file takes about 300 ms a snapshot and leaves a 6 MB object in the repository per version. Text is staged whatever its size, and a large untracked text file is hashed at that same cost for as long as it stays untracked. That is left to its owner: an untracked file is on its way to a commit or to `.gitignore`. With no size cap there is no size a file can cross between the two snapshots, so a file is in both trees or in neither, and never reads as created or deleted for having changed size. `MAX_DIFF_BYTES` at collect is the one size limit. A path the sniff cannot read is not staged either. `ls-files -o` lists a nested repository as a directory, and git refuses to stage one with no commit in it; handed such a path, it would fail the whole batch and leave every untracked file out of the snapshot. The paths to stage reach `git add` on stdin rather than as arguments. A command line holds about 1 MB on macOS, so as arguments a repository with some twenty thousand untracked files would make every `arm` fail with `E2BIG`, and its turns would get no diff at all. They are read as literal paths, so a name containing `*`, `?` or `[` is not taken for a pattern.

## Ending a turn

### A stop is not always the end of a turn

`end` runs on `Stop` and `StopFailure`, and neither always means the work is done.

A main agent can stop while subagents or workflows it started in the background are still working. Since Claude Code 2.1.145 the `Stop` payload lists the session's in-flight background work in `background_tasks`, each entry with a `type`. While that list holds a `subagent` or a `workflow`, `end` does nothing: the armed state and the watchers stay, and nothing is published. Other types do not hold the turn: a `shell` may be a server that never finishes, a `monitor` never does, a `cloud session` edits nothing local, and a `teammate` can stay alive idle. Launching an agent arms nothing, so the agents' own first tool call takes the baseline, before any of their edits.

Every background agent reports back when it ends, whether it completed, failed or was killed, and the report wakes the main agent as a new prompt, which `begin` lets carry the turn on. So a held turn always gets another `Stop` after its last agent finishes. That is where it is published, together with whatever the main agent did with the reports. `SubagentStop` is not registered for that reason: publishing when the last agent finishes would split that follow-up into a diff of its own. Only a session that goes away while its agents run leaves no report behind, and its turn is carried on by your next prompt in that chat.

`StopFailure` carries no `background_tasks`, and the work usually goes on once you retry. So `end` publishes the turn as still running, which opens "Changes so far", and keeps it armed. What you continue with lands in the same diff.

### Collecting

Changes are listed with `diff --name-status -z -M`, so each entry carries the path a file had and the path it has. Rename detection is on by default in git, and `--name-only` prints only a rename's destination. Listed that way, a moved file had no counterpart in the before tree and was recorded as an addition, while its deletion went unmentioned. A move plus an edit looked like a new file.

An entry whose contents are unchanged is dropped only when its two paths match as well. Otherwise a pure rename would vanish as "not a real change". Detection is still git's heuristic, not a record of what happened: two files that start out identical can pair the wrong way, and a heavily rewritten move arrives as a delete beside an add, the same as in staged changes.

An entry with nothing on either side is dropped as well. `arm` records a path outside every repository before the tool runs, so that a file which does not exist yet can still show up as created. A write that is then refused or fails leaves that path with neither a before-image nor a file. Kept as an entry, it made a turn that changed nothing publish a diff with nothing in it, which replaced the previous turn's diff.

A repository's before-images are read with one `git cat-file --batch`, after one `git cat-file --batch-check` that prints only their sizes. Spawning git costs about 10 ms, so reading them one file at a time would make ending a turn scale with the number of files changed; fifty files would spend half a second on process startup alone. As it is, a turn spawns the same handful of git processes whatever it touched: ten, or up to twelve when there are untracked files to stage. Input is NUL-terminated (`-z`) so paths containing newlines survive, matching the `-z` used to list them.

The sizes come first so that one large file cannot take the rest down with it. A file over `MAX_DIFF_BYTES` on either side is left out, like a binary, and its large side is never read. That is 50 MB, the default of VS Code's `diffEditor.maxFileSize`, above which the editor computes no diff anyway. No git command has a limit on its output. A limit would apply to a whole repository's before-images at once, so passing it would lose every change in that repository, silently.

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

Without the removal first there is a window where a superseded tab's id still matches the old manifest while the bytes underneath have already been replaced, and it would be handed the new turn's before-image for the old turn's diff. Removing it costs nothing: nothing watches the file, and a read landing in that window finds no manifest rather than the wrong bytes.

`beforeImages/` is created even when every change is an addition and nothing goes into it. Nothing reads the empty directory; it is there so the state on disk looks the same for every published turn to whoever inspects it.

The manifest is written to a temporary file and renamed into place. The rename is atomic, so a read landing mid-publish sees the old manifest or the new one, never half of one. The before-image provider reads it on every request.

`running` on the manifest records what the turn was when it was published, so the editor's title describes the diff on screen rather than the state of the moment. The manifest's `id` is random. It is only ever compared for equality, in a before-image's URI and in the provider's check, so all it has to be is unique, including between a look and the end of the same turn, which can run at once.

Nothing watches the manifest. The window that publishes is the window that renders. A turn reports `{ published: true }` back through the request it arrived on and the extension opens the diff, while the command publishes and renders in one go. That report is what keeps a turn that changed nothing from reopening the diff it left alone. Watching the file instead would decouple the two at the cost of waiting about 12 ms for an event carrying news the publisher already had. The server takes a callback rather than calling the renderer, so it stays a transport: it knows a turn published, not what anyone does about it.

There is no sweep and nothing ages out. A turn's state is replaced by the next turn's, so a project directory holds at most one turn's worth.

## Finishing a turn on demand

A turn you interrupt is never published by a hook. Claude Code runs no `Stop` hook for it, and your next prompt in that chat discards its baseline.

So asking for the diff publishes anything still armed before it renders. `endTurn` publishes whatever the armed turn has done so far, and finishes the turn, clearing the armed state and releasing its watchers, only when the transcript shows you interrupted it. Anything else still armed counts as running: a turn mid-work, one waiting for its agents, one cut short by an API error, and one whose `Stop` never reached the extension. A running turn keeps its baseline, so the rest of it is still captured and its real `Stop` publishes again on top.

Everything else follows. A running turn is collected afresh every time it is asked for, because nothing remembers the last look. An interrupted turn was collected when it was finished off, so its diff stops growing there, and files you touch by hand afterwards cannot wander into it. A turn that ended normally cleared `snapshots.tsv`, so there is nothing armed to collect. A running turn that has changed nothing publishes nothing, which leaves the previous turn and its title alone.

Only an explicit request takes this path. Rendering after `end` does not collect again, since the armed state is gone by then. A turn is published by the hook that ends it or by someone asking to see it, and by nothing else.

### Reading an interrupt from the transcript

`begin` and the look both ask one question of the transcript: did you interrupt the last turn? The last 64 KB is scanned backwards to the last `user` or `assistant` entry, and the answer is yes when that is a user entry starting with `[Request interrupted by user`, one of the two markers Claude Code writes on Esc. Claude Code counts its own interruptions by testing for the same prefix.

The transcript is not asked whether a turn ended in general. A turn waiting for its agents ends in `end_turn` exactly as a finished one does, and a turn cut short by an API error ends in an assistant entry whose `stop_reason` is `stop_sequence`, so reading an ending off the transcript would finish both off halfway. An interrupt is the one ending it shows for certain.

Scanning backwards rather than reading the last line matters twice. The interrupt marker is not last: `queue-operation`, `last-prompt` and `file-history-snapshot` land after it. And a rejected tool records the same `toolDenialKind` an interrupt does while the turn carries on, so a later assistant entry is found first. Sidechain entries are skipped, or a subagent's transcript would hide the main chain's ending.

Anything unreadable means not interrupted. Wrongly finishing a running turn would clear its baseline and leave the real `Stop` with nothing to publish; wrongly keeping one only carries it into the next prompt.

Closing the window mid-turn writes nothing. Claude Code records the result of a tool call that finishes as the window goes and then stops, with no interrupt marker and no entry saying the turn was cut off. When the window reopens, Claude Code resumes the turn itself with its hidden "Continue from where you left off." prompt, and that turn lands in one diff. A crash or a connection dropping mid-reply leaves the same trace as a turn still working, so the next prompt in that chat carries it on.

## Rendering

Status is not stored. It is derived when the diff opens, from two `existsSync` calls: no before-image is an addition, no after file is a deletion, both present is a modification, and differing paths are a rename. A stored status froze what the turn did at the moment it ended while the tree moved on: a file modified and then deleted by hand rendered with a right side that no longer existed, and one deleted and then recreated by hand still rendered as a deletion.

What keeps that derivation unambiguous is that an addition writes no before-image, so an empty image can only mean the file was already empty, and a missing one that there was no before. Nothing reclaims the images out from under a manifest: the only thing that deletes `beforeImages/` is the next publish rewriting it, and that removes the manifest first.

Changes that no longer represent anything renderable drop out at render time: a file reverted by hand, or one whose sides have both gone.

The diff of a finished turn is kept as a regular tab. `vscode.changes` opens a preview tab, which the next preview replaces: the next turn's diff, or any file clicked once in the explorer. Only the newest turn has a manifest, so a diff replaced that way cannot be opened again. The command takes a title and a list of resources and nothing else, so there is no option to pass. `workbench.action.keepEditor` is run straight after it instead, which keeps whatever editor is active, and at that moment it is the diff. A look at a running turn is left as a preview on purpose. Each look would otherwise leave a tab behind, where a preview gives way to the next look and then to the finished diff, which is kept. An editor opened with nothing in it is not kept either.

The multi-diff editor decides a file was renamed by comparing `originalUri.path !== modifiedUri.path`. Pointing `original` straight at the before-image on disk struck through every filename and stamped it `R`. The before side is served through a scheme that keeps the real path verbatim, so the two sides differ only where a file actually moved, which is exactly when a rename should show.

The manifest's id goes in the URI query, and the provider serves an image only while that id matches the published manifest. That gives every turn a distinct URI. Without it the URI would be the file's own path with the scheme swapped, identical every turn, and VS Code may serve the text model it cached for the previous turn, which renders as no change at all. Since every turn writes into the same `beforeImages/`, that comparison is also the only thing keeping a superseded tab off the new turn's contents.

The provider answers from the manifest, not from anything a render left behind. VS Code restores the multi-diff editor across a restart, but the extension host that rendered it is gone, so a cache filled at render time no longer holds the before-images. Every left side came back empty while the `A`/`M`/`D` badges, restored with the editor, still looked right.

A URI the provider cannot serve throws `FileNotFound` rather than resolving to empty. A file-backed model is re-read, and `TextFileEditorModel` keeps what it already has when that re-read reports this code (`isResolved() && result === FILE_NOT_FOUND` returns early). So a diff left open from an earlier turn stays readable after a later turn has replaced the manifest. Empty bytes are a valid answer and the editor believes them: the left side blanks and the whole file reads as newly added.

Before-images are served by a file system provider rather than a `TextDocumentContentProvider`, with `onFileSystem:claude-before` as an activation event. A restored diff that is the active tab asks for its content while the window is still starting, before `onStartupFinished` activates anything, and nothing in the workbench activates an extension on behalf of a text content provider. Resolution failed outright: every modified entry rendered as nothing while the title kept counting it, and waiting a few seconds before switching to the tab worked. The file service is the one resolver that waits. It fires `onWillActivateFileSystemProvider`, joins the activation promise, and only then looks for a provider.

The provider implements the entire interface, including the write methods that `isReadonly` makes unreachable. `_validateFileSystemProvider` type-checks `watch`, `stat`, `readDirectory`, `createDirectory`, `readFile`, `writeFile`, `delete` and `rename` at registration, and subscribes to `onDidChangeFile` without a check. Any of them missing throws inside `activate`, which takes down the whole extension, so the symptom is every command reporting itself as not found. The file service refusing writes on the readonly capability happens far later and is no reason to leave them out.

Firing `onDidChange` at registration is the tempting fix for a restored editor that shows nothing, and it makes matters worse: it drops every modified entry and leaves only the added file, the one with no left side to resolve. The model is not stale, it has never resolved.

## Watching files outside the workspace

VS Code only watches what is inside the workspace, so its in-memory copy of a file outside it lags behind disk until the window is refocused or the file is opened in an editor. VS Code makes that copy when Claude Code's `Read` reads the file, seconds before the `Edit` that follows, and Claude Code then writes to disk directly. The copy keeps the pre-edit text, which is exactly what the before-image holds, and the diff renders as no change at all.

Registering a `FileSystemWatcher` on such a path makes the file service report the write, which is what makes the editor reload. It is registered in `arm`, before the tool writes, and it still loses a race: `createFileSystemWatcher` returns at once while the watch starts a few processes away, and Claude Code writes within milliseconds of the hook replying. A write that lands before the watch is live is never reported. So a second after the watcher is created, the file's own access and modification times are written back onto it, exact to within the microsecond or so that `utimes` can represent. Its contents do not change, but the watcher, live by then, reports it, and the copy reloads. A write slow enough to come after that nudge, such as one waiting on a permission prompt, lands after the watch is live and is reported itself. Holding the reply in `arm` until the watch is live would work too, but it delays every first edit of an outside file by a guessed amount.

VS Code watches the file's directory, not the file, so a live watcher keeps every file in that directory fresh.

Watchers are released a couple of seconds after a turn ends, so a nudge from its last edit still has a watcher to report it. Only the watchers the turn had are released; a turn starting in the meantime keeps its own. A look at a running turn publishes without ending the turn, so the files it is still editing stay watched.

## Advertising

A window writes `server.json` for the project of its first workspace folder, the way Claude Code advertises its own IDE server in `~/.claude/ide`. The file is `0600` and holds a token. The server binds `127.0.0.1` on an ephemeral port and rejects any request whose token does not match.

One advert per project means one window serves it, and a window returning from a crash simply overwrites whatever was left behind. VS Code will not open two windows on the same folder; it focuses the one already open. Two windows on one project arise only when two multi-root workspaces share a first folder, or when two editors that both run this extension are open on it.

A window advertises again whenever it takes focus, so the window you are looking at is the one being served. That is why both writing and removing the advert compare its contents first. A window skips the write when the file is already its own, and leaves the file alone on the way out when another window has since claimed it. Without the second check, closing a window would remove an advert it no longer owned and leave the other window running but unreachable.

The advert is written to a temporary file and renamed into place, like the manifest. The hook reads it with one shell redirection, so a write that truncated first could let it read an empty file, parse no port, and exit having done nothing.

## Settings

`hooksMatchSpec` compares the groups holding our hooks against `HOOK_SPEC` exactly rather than checking that something of ours is present. Changing a matcher, a timeout or a command has to re-prompt, or everyone keeps running whatever they registered first. It goes through every event in the file as well as the spec's, so a hook of ours left under an event a later version stopped registering re-prompts too, and registering again removes it.

Removing our hooks takes out only our own entries and leaves the rest of each group in place. Claude Code's `/hooks` menu is read-only, so a command lands in one of our groups only when someone edits the file, by hand or by asking Claude, and removing whole groups would delete that command along with ours without a word. A shared group still fails the comparison above, so the invitation shows once. Registering again moves our entries into a group of their own and leaves theirs where it was.

`end` is registered for `StopFailure` as well as `Stop`. A turn cut short by an API error never reaches `Stop`. `end` publishes it as still running and keeps it armed, as described under "A stop is not always the end of a turn".

A subagent shares the main chat's session, so its hooks arrive under the same project and look like the turn's own. Its tool calls run `arm`, which is right: what a subagent edits is part of the turn. Its ending is another matter. A subagent that finishes raises `SubagentStop`, which is not registered, but one that dies on an API error raises the same `StopFailure` the main agent does. Every payload from inside a subagent carries an `agent_id`, and the main agent's never does, so `end` ignores an event that has one. Taking it for the end of the turn published the diff while the turn was still running and cleared its baseline, once per failed subagent. Several background agents hitting a usage limit within a minute opened a diff each, and each held only what had changed since the one before.

`arm` matches every tool that can write, including `Bash`, because a shell command is exactly what per-file capture cannot see coming.

## Naming

One name per entity, one entity per name. A suffix says what a value is, so nobody has to read an assignment to know whether a string is a path, and whether that path is absolute:

- `*File`: an absolute path to a file. `manifestFile`, `beforeImageFile`, `targetFile`, `copiedFile`.

- `*Dir`: an absolute path to a directory. `workspaceDir`, `repoDir`, `gitDir`, `beforeImagesDir`.

- `*Path`: a path that is relative, or whose kind is not known there. `beforePath` as git reports it, `targetPath` in `removeRecursive`.

- `*Name`: a bare name with no separators. `fileName`.

- `*Uri`: a `vscode.Uri`. `resourceUri`, `beforeUri`, `dirUri`.

- `*Contents`: bytes or text. `beforeContents`, `blobContents`.

The `Path`/`File` boundary carries real weight. Git reports repo-relative paths while the manifest holds absolute ones, so without the suffix, whether a value still needs joining to its repository would depend on which function you were reading. `join(repoDir, beforePath)` yielding a `beforeFile` is the visible seam between the two. Nothing carries the word "relative", because the `File` suffix already says the other thing.

Some words mean exactly one thing each. `change` is a manifest record, `snapshot` is a `snapshots.tsv` row, `blob` is git object content and never our own copy of a file, `image` is a published before-image. A repository root is a `repoDir`, never `repository`, `repo` or `root`. `workspaceDirs` holds our own path strings, never VS Code's `WorkspaceFolder` objects.

Verbs follow the return type: `read*` gives contents, `get*` gives an attribute or a derived value, `list*` gives a collection. `readFile`, `getFileSize`, `listRepos`.

`git` in `utils/git.js` is the one function named by a noun, so each call reads as the command it runs: `git(repoDir, 'write-tree')`.

Nothing outside `utils/files.js` calls an fs read that can throw, so callers branch on a value instead of wrapping every read. A failure is `undefined` for a single value and `[]` for a list.

Names we do not own are left alone: the file system provider's method names, `fsPath`, `extensionPath` and `workspace.workspaceFolders` from VS Code, and `file_path`, `notebook_path`, `transcript_path`, `session_id`, `agent_id`, `hook_event_name` and `background_tasks` from the hook payload.

Everything else is imported by name, builtins with the `node:` prefix, and nothing is imported as a module namespace. Each file then declares exactly what it touches, which is what makes sweeping for unused imports worth doing. `assert` in the tests is the one default import left, because a bare `strictEqual(...)` says too little about where it came from. A name is aliased only where the bare one loses its meaning at the use site: `sep as PATH_SEPARATOR` and `relative as getRelativePath`.
