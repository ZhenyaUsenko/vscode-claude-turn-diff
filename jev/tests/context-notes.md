# Background

Facts about the tools the extension works with: Claude Code, VS Code and git. Nothing here describes the extension itself; the tests do that.

## Claude Code

### Hooks

Claude Code runs the shell commands configured under `hooks` in `~/.claude/settings.json`. Each command receives a JSON payload on stdin carrying `session_id`, `transcript_path` and, from Claude Code 2.1.196, `prompt_id`.

| Event | Fires | Details |
| --- | --- | --- |
| `UserPromptSubmit` | when the user submits a prompt | Also fires when a message queued during a running turn, or a background command that finished, is handed to the running turn. Those payloads carry the running turn's `prompt_id`; a genuinely new prompt carries a fresh one. |
| `PreToolUse` | before each tool call | Carries `tool_name` and `tool_input`. `Edit`, `MultiEdit` and `Write` name their file in `tool_input.file_path`, `NotebookEdit` in `tool_input.notebook_path`. `Bash` carries the command to run. |
| `Stop` | when the main agent finishes a turn | Does not fire when the user interrupts the turn with Escape. |
| `StopFailure` | when a turn ends on an API error | A subagent that dies on an API error raises it too, under the main session. |

Payloads sent from inside a subagent carry `agent_id`; the main agent's payloads never do.

### Transcripts

- Claude Code writes one JSONL transcript per session at `~/.claude/projects/<key>/<session_id>.jsonl`. The `<key>` is the directory the session started in, with every character other than an ASCII letter or digit replaced by `-`.
- Each line is a JSON object whose `type` is, for example, `user`, `assistant`, `queue-operation`, `last-prompt` or `file-history-snapshot`.
- Assistant entries carry `message.stop_reason`: `end_turn`, `tool_use`, `pause_turn`, `max_tokens`, `stop_sequence` or `refusal`. After `tool_use` or `pause_turn` the turn goes on.
- When the user interrupts a turn, Claude Code writes a user entry whose text starts with `[Request interrupted by user`, usually followed by bookkeeping entries.
- Entries written by subagents carry `isSidechain: true`.

## VS Code

### Multi-file diff editor

- The command `vscode.changes` takes a title and a list of `[resourceUri, beforeUri, afterUri]` triples, and opens a multi-file diff editor as a preview tab, which the next preview to open replaces.
- Running `workbench.action.keepEditor` right afterwards turns the active editor into a regular tab.
- An entry without a `beforeUri` renders as an added file, and one without an `afterUri` as a deleted file. The editor marks an entry as a rename when `beforeUri.path` and `afterUri.path` differ.

### File system providers

- A provider registered for a URI scheme serves `stat` (type, timestamps and size) and `readFile` (the bytes) for URIs of that scheme.
- A size of 0 with empty bytes is an ordinary empty file, shown as an empty document.
- When `readFile` or `stat` throws `FileSystemError.FileNotFound` for a URI whose text is already loaded, the editor keeps the text it has. For a URI that was never loaded, the entry fails to resolve. Returning empty bytes instead of throwing makes the editor show an empty file.

### Workspace

- `workspace.workspaceFolders` lists the open folders and is `undefined` when none is open.
- `workspace.createFileSystemWatcher(pattern)` returns a watcher with a `dispose()` method. VS Code watches files inside the workspace on its own, but not files outside it.

## git

- `git write-tree` writes the current index as a tree object and prints its hash. With `GIT_INDEX_FILE` pointing at a copy of the index, `git add -u` and `git add -f` stage into that copy and leave the real index alone.
- The index records each file's size and modification time. git skips re-reading a file whose size and modification time match its index entry, unless the entry's modification time is not older than the index file's own: such an entry is racily clean, and git re-reads the file.
- `git diff --name-status -z -M` prints each change as a status letter and a path, NUL-terminated. For a rename (`R`) or a copy (`C`), the old path is followed by the new one. Rename detection pairs a deleted path with an added path of similar contents.
- `git cat-file --batch -z` reads NUL-terminated object names such as `<tree>:<path>` and prints, for each, a header line `<hash> blob <size>` followed by the contents and a newline, or `<name> missing` when there is no such object. For an empty blob the header is `<hash> blob 0` and the contents are empty.
- `git ls-files -o --exclude-standard -z` lists untracked paths that are not ignored, NUL-separated.
