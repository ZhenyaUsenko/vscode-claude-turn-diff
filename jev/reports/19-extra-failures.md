# Extra failures

An extra failure is a test a model failed that the real suite passes under the same bug. A failure on clean code is a false alarm. This report goes through every one of them in the closed batches compared in report 18:

| Batch | Runs | Extra failures | False alarms on clean code |
| --- | --- | --- | --- |
| Opus 5.5, extra high (report 17) | 26 | 0 | 0 |
| GPT-6-Astra, high (report 17) | 26 | 7 | 0 |
| Fable 5.0, high | 26 | 3 | 0 |
| Sonnet 5.5, high | 26 | 8 | 0 |
| 5.6 Sol, high | 26 | 28 | 0 |
| 6.1 Sol, high | 26 | 20 | 0 |
| 6.1 Sol, high, fast tier | 26 | 10 | 0 |
| 6.1 Sol, medium | 26 | 7 | 0 |
| 6 Sol, high, standard and fast tier | 2 clean runs | none | 4 |

Report 17's two batches used the old test ids. They are mapped onto today's ids here by position, which is safe because the order and the statements are unchanged. Below, "6.1 Sol" is its standard tier at high effort, "6.1 Sol fast" its fast tier, and "6.1 Sol medium" its standard tier at medium effort.

## Summary

Of the 87 failures, 85 hold up. They come in four kinds:

| Kind | Count | Opus 5.5 xhigh | Astra | Fable 5.0 | Sonnet 5.5 | 5.6 Sol | 6.1 Sol | 6.1 Sol fast | 6.1 Sol medium | 6 Sol |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Consequences of the bug that the real fixtures never reach | 49 | 0 | 7 | 3 | 8 | 8 | 9 | 8 | 6 | 0 |
| Statements that claim more than the code does, flagged whatever the bug | 34 | 0 | 0 | 0 | 0 | 20 | 9 | 2 | 1 | 2 |
| A real bug in the clean code | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| Wrong | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |

- **Consequences** are failures the statement predicts and the real test doesn't exercise, usually because its fixture happens to avoid the case. A judge that reads the statement literally should flag them, so they count against the real suite's coverage, not against the judge. Opus 5.5 at extra high flagged none; every other model flagged some.

- **Overclaims** are statements that say "every", "whatever" or "any" where the code has a limit. They don't depend on the bug: 5.6 Sol raised the same three in run after run. Two of them point at behavior worth fixing in the extension, not only in the wording.

- **The real bug** is the phantom change found earlier.

- **The only wrong failures** came from 6 Sol, which isn't in report 18's half-batches or full batches.

## How each was checked

Every claim below was checked against the source. Several were also run:

- **blob-offset**: three cases on a patched copy of the code.

- **The 64 MiB cap and the shared hook group**: run against the clean code.

- **The phantom change**: already reproduced in `repro/ghost-change.mjs`.

## Consequences the fixtures never reach

### `Workspace: Outside files come last, in tree order` under tree-order

- **Bug**: `compareFilesInTreeOrder` puts files before folders.

- **Statement**: "Outside files are listed after the repository changes, and among themselves in tree order rather than in the order the tools named them."

- **Real failure**: `Capture: Changes follow the order of the explorer` only.

- **Flagged by**: Astra, Fable 5.0, Sonnet 5.5, 5.6 Sol, 6.1 Sol, 6.1 Sol fast and 6.1 Sol medium. Opus 5.5 at extra high flagged it in report 5's batch, not in report 17's.

- **Reason given**: "Outside files come last, but their comparator places files before folders rather than folders before files." (6.1 Sol)

- **Notes**: correct. `collectOutsideChanges` sorts the touch list with the same comparator, so a file now sorts before a folder beside it. The real test's two files, `~/aaa-outside/earlier.md` and `~/zzz-outside/later.md`, first differ at a level where both sides are folders, so the inverted rule never comes into play.

### Eight tests under blob-offset

- **Bug**: `splitBlobContents` skips each blob's contents but not the newline after them, so every blob after the first is read from the wrong offset and the before-images shift onto the wrong files.

- **Real failures**: `Capture: Every changed file is listed` and `Capture: Binary files are left out`.

- **What the bug actually does**: after each blob that exists, the parser reads the separating newline as an empty blob. So the next file gets empty contents, and every later file gets the contents meant for the file before it. Where the first changed file sits in path order decides which tests notice.

| Test | Statement | Flagged by | Checked |
| --- | --- | --- | --- |
| `View: Added, modified and deleted files get the right sides` | "…An added file has no left side, and a deleted file has no right side." | Astra, Sonnet 5.5, 5.6 Sol, 6.1 Sol fast | Ran it: with `a.txt` modified and `b.txt` added, `b.txt` got a before-image, so it renders with a left side. The real fixture lists `added.txt` first, where nothing has shifted yet. |
| `View: An emptied file and a deleted empty file both render` | "An empty file the turn deleted and a file the turn emptied both appear in the diff…" | Astra, Fable 5.0, Sonnet 5.5, 5.6 Sol, 6.1 Sol, 6.1 Sol fast | Ran it: with the deleted empty file sorted first, the emptied file gets the bogus empty before-image, equals its new empty contents, and drops out. The real fixture sorts `emptied.txt` before `gone.txt`, and `gone.txt`'s real before-image is empty anyway. |
| `View: A file reverted by hand drops out` | "…a file whose contents on disk are identical to its before-image… is left out…" | 5.6 Sol, 6.1 Sol | Ran it: with `g.txt` reverted instead of `f.txt`, its before-image is empty, doesn't match, and it stays listed. The real fixture reverts the first file, whose image is right. |
| `Capture: A moved file keeps its old contents as the before-image` | "…the before-image holds what the file contained at its old path when the turn started…" | 6.1 Sol, 6.1 Sol fast | From the code: a moved file listed after any other existing file gets shifted contents. The real fixture moves a single file. |
| `Retention: A later turn replaces the before-images` | "…the before-image afterwards holds what the file contained when the later turn started." | 6.1 Sol, 6.1 Sol fast | From the code: same shift, with any second file in the later turn. The real fixture changes one file. |
| `Capture: A created empty file is listed with no before-image` | "An empty file created by the turn appears in the diff as an added file, with no before-image." | 6.1 Sol fast | From the code: listed after an existing file, the new empty file gets the bogus empty before-image, which equals its contents, so it's dropped as unchanged. The real fixture creates only that one file. |
| `Capture: A deleted empty file keeps an empty before-image` | "An empty file deleted by the turn appears in the diff as a deleted file, with a before-image that exists and is empty." | 6.1 Sol fast | From the code: listed after two other existing files, it gets the second one's contents as its before-image. The real fixture deletes only that file. |
| `View: A move renders as a rename` | "A moved file appears as one entry named by its new path, with its two sides on its old and its new path…" | 6.1 Sol fast | From the code: listed after an existing file and then an added one, a moved file gets the added file's "missing" entry, so it has no before-image and renders as an addition. The real fixture moves a single file. |

The two flagged tests the models agree on most, the added file's left side and the emptied file, are also the most visible effects in real use: whether files render as added or vanish depends on their names.

### Four tests under same-contents-unguarded

- **Bug**: `sameContents` drops its size comparison, which was also what kept it from reading a missing file, so rendering a turn that created a file throws.

- **Real failures**: three view tests, `View: Added, modified and deleted files get the right sides`, `View: An emptied file and a deleted empty file both render` and `View: A turn that only adds files still renders`.

- **Flagged by**: Astra, Sonnet 5.5, 5.6 Sol, 6.1 Sol and 6.1 Sol medium, all four of these tests:

  - `Capture: Every changed file is listed`: "Text files inside a workspace repository that the turn modified, created or deleted appear in the turn's diff…"

  - `Capture: A created empty file is listed with no before-image`: "An empty file created by the turn appears in the diff as an added file, with no before-image."

  - `Capture: A deleted empty file keeps an empty before-image`: "An empty file deleted by the turn appears in the diff as a deleted file, with a before-image that exists and is empty."

  - `Workspace: A created outside file has no before-image`: "…appears in the diff as an added file, with no before-image."

- **Reason given**: "Opening a diff containing an added or deleted file throws because `sameContents` is called when one side is missing." (5.6 Sol)

- **Notes**: correct in what it says the code does. `getResources` calls `sameContents` for every entry whose two paths match, added and deleted files included, and `readFile` returns `undefined` for the missing side, so `.equals` throws and no diff opens. Whether these four tests should fail depends on what "appears in the diff" means:

  - The capture is fine. The published diff, the manifest, lists every one of these files, which is all the real capture tests check.

  - Only opening it fails. The terms define the published diff as the list and say "opening the diff shows the published one".

  So the models read "the diff" as what opens. That reading is defensible, but the statements don't settle it.

- **One more, from 6.1 Sol medium**: `Server: A turn ended through the hook opens its diff`, "When a turn ends through the hook script and publishes a diff, the window serving the project opens that diff exactly once." Correct, and here nothing depends on what "the diff" means: opening throws, the extension logs "could not open the diff", and nothing opens. The real test's turn only modifies a file, so it never meets the bug.

### `Capture: A moved file keeps its old contents as the before-image` under before-side-after-path

- **Bug**: `getResources` puts the before side on the after path, so a moved file's two sides share one path and its before-image is looked up under the new path.

- **Statement**: "For a file the turn moved and edited, the before-image holds what the file contained at its old path when the turn started, so the diff shows the edit."

- **Real failure**: `View: A move renders as a rename`.

- **Flagged by**: Sonnet 5.5 and Fable 5.0.

- **Reason given**: "the before-image is stored under the old path, but its URI is built from the new path, so the provider cannot find it and the diff cannot show the edit." (Sonnet 5.5)

- **Notes**: correct. The before-image itself is right, and the real test only checks that. The statement's closing clause, "so the diff shows the edit", is what fails: the provider joins the new path onto `beforeImages/`, finds nothing and throws `FileNotFound`. It's an example of a rationale clause quietly turning a capture test into a rendering one.

## Statements that claim more than the code does

These were flagged under bugs that have nothing to do with them, so they are really verdicts on the statements. Two of them describe behavior worth fixing in the extension itself.

### Tracked files over 64 MiB

- **Tests**:

  - `Capture: Untracked files over one megabyte are ignored`: "Untracked files larger than one megabyte are ignored… Tracked files are included whatever their size."

  - `Capture: Every changed file is listed`.

- **Flagged**: 18 times. 5.6 Sol 14 times, under 11 different bugs; 6.1 Sol 3 times; 6 Sol once on clean code.

- **Reason given**: "Reading a tracked before-image larger than 64 MiB exceeds the git command's output limit, so tracked files are not included regardless of size." (6 Sol)

- **Notes**: correct, and worse than the models said. `readBlobContents` runs one `git cat-file --batch` for all of a repository's changed paths, with a 64 MiB `maxBuffer`. If the before-images together exceed it, `execFile` fails, `readBlobContents` resolves `null`, and `collectRepoChanges` skips the whole repository.

  - **Run on the clean code**: a turn that changed a tracked 70 MB file and a small one published nothing at all.

  - **Binary files too**: the read happens before the binary check, so the same would follow from a large tracked binary, such as a video asset, changing in a turn.

  - **No trace**: nothing is logged, and the repository's changes simply don't appear.

### Gitignored files

- **Test**: `Capture: Every changed file is listed`: "Text files inside a workspace repository that the turn modified, created or deleted appear in the turn's diff."

- **Flagged**: 3 times, all 5.6 Sol.

- **Reason given**: "Untracked files excluded by git ignore rules are omitted even when they are text files inside the repository."

- **Notes**: correct. Untracked files are listed with `--exclude-standard`, and an editing tool naming a path inside a repository skips per-file capture. The README lists this as a limitation, but no test does, and the tests' introduction says a general rule's exceptions are covered by other tests.

### Another tool's hook inside the extension's group

- **Test**: `Install: Other tools' hooks are ignored`: "Other tools' hooks in the same settings, whether on the extension's events or on other events, do not affect whether the extension's hooks count as registered. Only the extension's own entries are compared."

- **Flagged**: 10 times. 6.1 Sol 4 times, 6.1 Sol fast twice, 5.6 Sol 3 times, 6 Sol once on clean code.

- **Reason given**: "Registration compares entire groups containing an extension hook, so another tool's hook in the same group affects the result." (6.1 Sol)

- **Notes**: correct. `hooksMatchSpec` compares whole groups that contain any hook of ours, so a command someone adds inside our `PreToolUse` group makes the settings count as unregistered. Running it on the clean code showed something worse:

  - The extension keeps offering to register.

  - Accepting runs `stripOurHooks`, which removes whole groups that contain our hook, so the other command is deleted along with ours. A backup is written first.

  The real test only adds foreign hooks in their own groups.

### Two publishes in the same millisecond

- **Tests**:

  - `Running: A look and the end get distinct stamps`: "A look at a running turn and the end of that turn a moment later, even within the same second, publish diffs with different stamps."

  - `View: Each turn gets a distinct before-image URI`.

- **Flagged**: 3 times, twice by 6.1 Sol in one run and once by 6.1 Sol medium.

- **Reason given**: "Stamps contain only the millisecond timestamp and process ID, so two publishes in the same millisecond can receive identical stamps."

- **Notes**: true to the letter, negligible in practice. A stamp is `${Date.now()}-${process.pid}`. Each publish spends tens of milliseconds in git before writing its manifest, so two publishes landing in the same millisecond would need a look and an end running at the same moment and finishing together. The statements' "a moment later" already excludes that.

## A real bug in the clean code

- **Bug the run was under**: touch-copy-canonical, which is unrelated.

- **Tests**:

  - `Retention: A turn that changes nothing leaves the previous diff`: "A turn that changes nothing publishes nothing: the previous turn's diff and before-images stay exactly as they were."

  - `Running: Only an end that published reports it`.

- **Flagged by**: 6.1 Sol, once each.

- **Reason given**: "Naming an outside file that remains nonexistent records a change and replaces the previous diff despite nothing changing."

- **Notes**: correct for the clean code too. This is the phantom change reproduced in `repro/ghost-change.mjs`:

  - An editing tool names an outside file that doesn't exist yet, and it goes on the touch list with no copy. If the file is never created, for example because the write was denied, `addChange` still records a change with neither side.

  - The turn then publishes, replacing the previous diff, and the new one renders empty.

  Neither of 6.1 Sol's clean runs raised it. Earlier, only a max-effort split agent and one suite run had found it.

## Wrong

### `Capture: A same-size edit is seen a second later` on clean code

- **Statement**: "An edit is detected even when it leaves the file the same size, lands within the same second the file was last committed, and the turn only ends a second or more later…"

- **Flagged by**: 6 Sol, on both tiers.

- **Reasons given**:

  - "Preserving the index's old modification time can let git skip a same-size edit whose file timestamp still matches its index entry." (standard)

  - "Git can trust the copied index's unchanged size and timestamp, so `git add -u` can miss the edit." (fast)

- **Notes**: backwards. Keeping the real index's modification time on the copy is what makes the entry racily clean: its time is not older than the index's own, so git re-reads the file and sees the edit. A copy with a fresh time is the `index-mtime` bug, and that is when git trusts the entry. Git also smudges racily clean entries whenever it rewrites the real index, so a later index write can't cause the miss either.

## What this suggests

- **Scoring**: about half the extras are correct failures that the real suite doesn't reach. Counting them as errors penalizes the judges that read statements literally. A stricter judge that flags nothing beyond the fixtures, Opus 5.5 at extra high here, looks cleaner than it is. Scoring against per-bug expected statements, as discussed for the refactor, would count them properly.

- **Statements**: the refactored bullets keep three of the overclaims:

  - "Tracked files appear in the diff regardless of their size";

  - "A file the turn modified, created or deleted appears in the diff", which says nothing of gitignored files;

  - "Other tools' hooks on any event do not affect whether the extension's hooks count as registered".

  The capture bullets also leave open whether "appears in the diff" means the published list or what opens.

- **The extension**: three findings are about the code, not the tests:

  - the 64 MiB cap silently dropping a whole repository's changes;

  - registration deleting another tool's hook that shares a group with ours;

  - the phantom change.

## Files

- Collected from the run records of batches `cli-closed-xhigh-24`, `codex-astra-closed-high-24`, `cli-fable5-closed-high`, `cli-sonnet55-closed-high`, `codex-sol56-closed-high`, `codex-sol61-closed-high`, `codex-sol6-closed-high` and `codex-sol6-closed-high-fast`, from each run's `score.extra`, or `score.agentFails` for clean runs, with the reasons from `verdicts`.

- Bug descriptions are the paragraphs at the top of the patches in `bugs/`; statements are from `tests/behavior-tests.md`.
