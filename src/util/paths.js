const os = require('os')
const path = require('path')

const CLAUDE_DIR = path.join(os.homedir(), '.claude')

const STATE_ROOT = path.join(CLAUDE_DIR, 'turn-diff')

const TRANSCRIPTS_ROOT = path.join(CLAUDE_DIR, 'projects')

const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')

const INSTALLED_HOOK = path.join(CLAUDE_DIR, 'hooks', 'turn-diff.sh')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const projectKey = (dir) => dir.replace(/[^a-zA-Z0-9]/g, '-')

const projectDirFor = (project) => path.join(STATE_ROOT, project)

const chatsDirFor = (project) => path.join(projectDirFor(project), 'chats')

const chatDirFor = (project, sessionId) => path.join(chatsDirFor(project), sessionId)

const manifestFor = (project) => path.join(projectDirFor(project), 'open.json')

const serverDirFor = (project) => path.join(projectDirFor(project), 'servers')

const serverFileFor = (project, pid) => path.join(serverDirFor(project), `${pid}.json`)

const transcriptFor = (project, sessionId) => path.join(TRANSCRIPTS_ROOT, project, `${sessionId}.jsonl`)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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
