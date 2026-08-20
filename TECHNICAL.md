# Technical notes

Why the code is shaped the way it is. Most of this was learned the hard way, and
none of it is visible from reading the source.

## The hook is a thin client

Claude Code runs `~/.claude/hooks/turn-diff.sh` before every write-capable tool
call, so it is a hot path. It does no work of its own: it finds the VS Code
window serving the session and hands the payload over a loopback socket, and all
the capture logic runs inside the extension.

Wire format is two lines, and the reply is `ok\n` or `err\n`:

```
<token>\t<mode>\t<project>\n
<raw hook payload json>\n
```

The hook waits for the reply, because `arm` has to finish snapshotting before
the tool it precedes is allowed to run.

It is deliberately pure bash with no subprocesses — a `/dev/tcp` round trip
costs about 3 ms, less than spawning any interpreter would. That is also why the
two fields are pulled out of the advert with parameter expansion rather than
`jq`. If no window is serving the project the connection fails and the hook
exits 0; nothing would be rendered anyway.

## The project key comes from the transcript path, never from the cwd

Claude Code files a session under the directory it *started* in:

```
~/.claude/projects/<key>/<sessionId>.jsonl
```

The hook reads that key straight out of `transcript_path`, which every payload
carries. It must not derive the key from `$PWD`.

`$PWD` follows every `cd` Claude runs. A turn that changes directory would send
`begin` and `arm` to one project and `end` to another, so the turn's state was
written under a key nobody was serving and the diff silently never appeared. It
looked intermittent because only long, `cd`-heavy turns hit it.

For the same reason nothing below the wire boundary ever sees a directory —
`turn/` and `util/paths` take a key, and `projectKey()` is called only where the
extension legitimately starts from a workspace folder.

## Two capture mechanisms

Neither covers everything on its own:

- **Tree snapshots** catch anything a shell command does — `rm`, `sed`, a
  formatter, package-lock churn — but only inside a git worktree.
- **Per-file capture** catches edits outside every repository, but only for
  paths an `Edit`/`Write` tool names.

A shell command writing outside every repository is caught by neither.

The repository snapshot happens once per turn; later `arm` calls fall through to
the cheap per-file branch, which is what keeps a turn with dozens of tool calls
affordable.

## Snapshots copy the index, and must preserve its mtime

A worktree is snapshotted to a dangling tree object by copying `.git/index`
aside and pointing `GIT_INDEX_FILE` at the copy, so the real staging area is
never touched.

The copy has to keep the source's mtime. Git decides an index entry needs its
content re-read by comparing the entry's mtime against the index file's own; a
copy made with a fresh timestamp makes every entry look safely older, so git
trusts its cached stat data. The visible symptom was an edit that left a file
the same size, made in the same second as the last commit, going unreported —
but only once the snapshot happened a second or more later, which is why it
presented as a flaky test.

Untracked files over `MAX_UNTRACKED_BYTES` are excluded from **both** snapshots,
so they cancel out and never appear. Tracked files are never size-filtered: git
only re-hashes those whose stat info changed, whereas untracked ones are hashed
from scratch on every snapshot.

A repository's before-images are read by one `git cat-file --batch`, not by
`git show` per file. Spawning git costs about 10 ms, so per-file reads made
ending a turn scale with the number of files changed: 50 files spent half a
second on process startup alone. A turn now spawns a constant eleven git
processes. Input is NUL-terminated (`-z`) so paths containing newlines survive,
matching the `-z` already used to list them.

## Publishing and reclaiming

`end` writes the manifest to `open.json.tmp` and renames it into place. The
rename is atomic, so the watcher can never read a half-written file.

It publishes *before* purging. With parallel chats the manifest being replaced
may still belong to another chat, and it must never point at before-images that
have already been deleted.

Everything is reclaimed by events rather than by age — a finishing turn knows
exactly which state its own manifest supersedes, so there is no scheduled sweep:

- Its own older `before-*` directories.
- Sibling chats that no longer exist in `~/.claude/projects`. Finding our own
  transcript first proves the key mapping is right; without that check a
  mismatched key would make every sibling look deleted.
- Superseded turns of chats that still exist, but only ones strictly *older*
  than this turn — two chats finishing in the same second must not delete each
  other's images and leave the winning manifest dangling.

Chats live under `chats/` so that listing them yields chats and nothing else.
They were once siblings of `servers/`, and since no chat is named "servers",
every finishing turn concluded that directory belonged to a deleted chat and
deleted the running window's own advert. The first diff of a session worked and
every turn after it silently did nothing until the window was reloaded.

## Rendering

The multi-diff editor decides a file was **renamed** by comparing
`originalUri.path !== modifiedUri.path`. Pointing `original` straight at the
before-image on disk struck through every filename and stamped it `R`. Serving
it through a scheme that keeps the real path verbatim means only the scheme
differs, so no rename is inferred.

The turn stamp goes in the URI query, so each turn addresses its before-image by
a distinct URI. Without it the URI is the file's own path with the scheme
swapped — identical every turn — and VS Code may serve the text model it cached
for the previous turn, which renders as no change at all.

The provider answers from the manifest rather than from anything a render left
behind. VS Code restores the multi-diff editor across a restart, but the
extension host it was rendered by is gone, so a cache filled at render time no
longer holds those before-images: every left side came back empty while the
`A`/`M`/`D` badges, restored with the editor, still looked right.

A URI it cannot serve throws `FileNotFound` rather than resolving to empty. A
file-backed model is re-read, where the one-shot content of a
`TextDocumentContentProvider` never was, and `TextFileEditorModel` keeps what it
already has when that re-read reports this code — `isResolved() && result ===
FILE_NOT_FOUND` returns early — so a diff left open from an earlier turn stays
readable once a later turn has replaced the manifest. Empty bytes are a valid
answer and the editor believes them: the left side blanks and the whole file
reads as newly added.

Before-images are served by a **file system provider** rather than a
`TextDocumentContentProvider`, with `onFileSystem:claude-before` as an
activation event. A restored diff that is the active tab asks for its content
while the window is still starting, before `onStartupFinished` activates
anything, and a text model content provider has no activation event of its own —
nothing in the workbench activates an extension on behalf of one. Resolution
failed outright, so every modified entry rendered as nothing while the title
went on counting it; waiting a few seconds before switching to the tab worked,
which is what a race looks like. The file service is the one resolver that
waits: it fires `onWillActivateFileSystemProvider`, joins the activation
promise, and only then looks for a provider.

The provider implements the entire interface, including the write methods that
`isReadonly` makes unreachable. `_validateFileSystemProvider` type-checks
`watch`, `stat`, `readDirectory`, `createDirectory`, `readFile`, `writeFile`,
`delete` and `rename` at registration, and `onDidChangeFile` is subscribed there
without a check. Any one of them missing throws inside `activate`, which takes
down the extension entirely — so the symptom is every command reporting itself
as not found, with nothing pointing at the diff. The file service refusing
writes on the readonly capability happens far later, and is no reason to leave
them out.

Firing `onDidChange` at registration was tried first, to refresh a model assumed
to be stale. It dropped every modified entry from the restored editor, leaving
only the added file — the one entry with no left side to resolve — and it
treated the wrong problem: the model was never stale, it had never resolved.

Binary files are skipped rather than listed. The editor resolves *both* sides
through the text model service, so a binary entry cannot render: it would be
counted in the title while missing from the view.

Both sides are sniffed for a NUL byte within `BINARY_SNIFF_BYTES`, the same
heuristic git uses, at the single point every entry passes through. It was once
`git diff --numstat` per changed file — a subprocess each, and it covered only
the repository collector, so a binary outside every repository was counted and
then rendered as nothing.

A manifest's statuses were frozen when it was written and the tree may have
moved on, so entries that no longer represent something renderable are dropped
at render time — a file reverted by hand, or a before-image already reclaimed.

## Watching files outside the workspace

VS Code only watches what is inside the workspace, so its in-memory copy of a
file outside it lags behind disk until the window is refocused. Claude Code
opens the document to show its own inline diff and then writes to disk directly,
so the editor keeps the pre-edit text — which is exactly what the before-image
holds, and the diff renders as no change at all.

Registering a `FileSystemWatcher` on those paths makes the file service report
the write, which is what makes the editor reload. It has to happen in `arm`,
before the tool writes; doing it at render time is too late for the first edit
of each file.

Watchers are keyed by session. The map is shared by every chat in the window, so
disposing them wholesale at `end` would release a parallel chat's watchers
mid-turn.

## Advertising

Each window writes `servers/<pid>.json` for the project of its first workspace
folder, mirroring how Claude Code advertises its own IDE server in
`~/.claude/ide`. The file is `0600` and holds a token; the server binds
`127.0.0.1` on an ephemeral port and rejects any request whose token does not
match.

A window only ever writes and removes its own file, so a second window on the
same project is left alone. Adverts whose pid no longer exists are dropped —
`EPERM` means the process exists but belongs to someone else, so those are left
in place.

## Settings

`hooksRegistered` compares our entries against `HOOK_SPEC` exactly rather than
merely checking that something of ours is present. Changing a matcher, a timeout
or a command has to re-prompt, or everyone keeps running whatever they
registered first.

`end` is registered for `StopFailure` as well as `Stop`: a turn cut short by an
API error never reaches `Stop`, and its snapshot would sit unclaimed until the
next prompt discarded it.

`arm` matches every tool that can write, including `Bash`, because a shell
command is exactly the case per-file capture cannot see coming.
