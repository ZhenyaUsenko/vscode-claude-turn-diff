import { homedir } from 'node:os'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const BEFORE_PREFIX = 'before-'

const CLAUDE_DIR = join(homedir(), '.claude')

const STATE_ROOT = join(CLAUDE_DIR, 'turn-diff')

const TRANSCRIPTS_ROOT = join(CLAUDE_DIR, 'projects')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json')

export const INSTALLED_HOOK = join(CLAUDE_DIR, 'hooks', 'turn-diff.sh')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getProjectKey = (dir) => dir.replace(/[^a-zA-Z0-9]/g, '-')

export const getProjectDir = (project) => join(STATE_ROOT, project)

export const getChatsDir = (project) => join(getProjectDir(project), 'chats')

export const getChatDir = (project, sessionId) => join(getChatsDir(project), sessionId)

export const getManifestFile = (project) => join(getProjectDir(project), 'manifest.json')

export const getServerDir = (project) => join(getProjectDir(project), 'servers')

export const getServerFile = (project, pid) => join(getServerDir(project), `${pid}.json`)

export const getTranscriptFile = (project, sessionId) => join(TRANSCRIPTS_ROOT, project, `${sessionId}.jsonl`)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getSnapshotsFile = (chatDir) => join(chatDir, 'snapshots.tsv')

export const getTouchListFile = (chatDir) => join(chatDir, 'touchList.txt')

export const getTouchCopiesDir = (chatDir) => join(chatDir, 'touchCopies')

export const getArmedTurnPaths = (chatDir) => {
  return [getSnapshotsFile(chatDir), getTouchListFile(chatDir), getTouchCopiesDir(chatDir)]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getBeforeDir = (chatDir, stamp) => join(chatDir, `${BEFORE_PREFIX}${stamp}`)

export const isBeforeDirName = (dirName) => dirName.startsWith(BEFORE_PREFIX)

export const getBeforeStamp = (dirName) => +dirName.slice(BEFORE_PREFIX.length)
