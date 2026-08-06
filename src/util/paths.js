// State layout, keyed by project the way Claude Code keys ~/.claude/projects
// (the working directory with every non-alphanumeric byte replaced by a dash):
//
//   <stateRoot>/<project>/open.json           the manifest, one per project
//   <stateRoot>/<project>/servers/<pid>.json  a window offering its port
//   <stateRoot>/<project>/chats/<sessionId>/  one per chat
//       prompt  repos.tsv  touched.tsv  blobs/  before-<epoch>/
//
// Keeping a project's manifest and its before-images in one subtree is what
// makes them impossible to prune apart, and lets a finishing turn find sibling
// chats by listing a directory.

const os = require('os')
const path = require('path')

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const STATE_ROOT = path.join(CLAUDE_DIR, 'turn-diff')
const TRANSCRIPTS_ROOT = path.join(CLAUDE_DIR, 'projects')
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')
const INSTALLED_HOOK = path.join(CLAUDE_DIR, 'hooks', 'turn-diff.sh')

// Derived from the literal path, never a canonicalised one, so it matches the
// directory name Claude Code files the session under. The hook does not compute
// this: a session keeps the key of the directory it started in, while the hook's
// cwd follows every `cd` Claude runs, so the hook reads the key straight out of
// the transcript path instead.
const projectKey = (directory) => directory.replace(/[^a-zA-Z0-9]/g, '-')

const projectDirFor = (project) => path.join(STATE_ROOT, project)
const chatsDirFor = (project) => path.join(projectDirFor(project), 'chats')
const chatDirFor = (project, sessionId) => path.join(chatsDirFor(project), sessionId)
const manifestFor = (project) => path.join(projectDirFor(project), 'open.json')
const serverDirFor = (project) => path.join(projectDirFor(project), 'servers')
const serverFileFor = (project, pid) => path.join(serverDirFor(project), `${pid}.json`)

// Claude Code keeps one transcript per chat here and removes it when the chat
// is deleted or expires, which is how we notice state for a chat that is gone.
const transcriptFor = (project, sessionId) =>
  path.join(TRANSCRIPTS_ROOT, project, `${sessionId}.jsonl`)

module.exports = {
  CLAUDE_DIR,
  SETTINGS_FILE,
  INSTALLED_HOOK,
  projectKey,
  projectDirFor,
  chatsDirFor,
  chatDirFor,
  manifestFor,
  serverDirFor,
  serverFileFor,
  transcriptFor,
}
