import os from 'os'
import path from 'path'

export const CLAUDE_DIR = path.join(os.homedir(), '.claude')

export const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json')

export const INSTALLED_HOOK = path.join(CLAUDE_DIR, 'hooks', 'turn-diff.sh')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const STATE_ROOT = path.join(CLAUDE_DIR, 'turn-diff')

const TRANSCRIPTS_ROOT = path.join(CLAUDE_DIR, 'projects')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getProjectKey = (dir) => dir.replace(/[^a-zA-Z0-9]/g, '-')

export const getProjectDir = (project) => path.join(STATE_ROOT, project)

export const getChatsDir = (project) => path.join(getProjectDir(project), 'chats')

export const getChatDir = (project, sessionId) => path.join(getChatsDir(project), sessionId)

export const getManifestFile = (project) => path.join(getProjectDir(project), 'open.json')

export const getServerDir = (project) => path.join(getProjectDir(project), 'servers')

export const getServerFile = (project, pid) => path.join(getServerDir(project), `${pid}.json`)

export const getTranscriptFile = (project, sessionId) => path.join(TRANSCRIPTS_ROOT, project, `${sessionId}.jsonl`)
