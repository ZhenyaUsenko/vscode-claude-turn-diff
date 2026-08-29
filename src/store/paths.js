import { homedir } from 'node:os'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const CLAUDE_DIR = join(homedir(), '.claude')

const STATE_ROOT = join(CLAUDE_DIR, 'turn-diff')

const TRANSCRIPTS_ROOT = join(CLAUDE_DIR, 'projects')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json')

export const INSTALLED_HOOK = join(CLAUDE_DIR, 'hooks', 'turn-diff.sh')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getProjectKey = (dir) => dir.replace(/[^a-zA-Z0-9]/g, '-')

export const getProjectDir = (project) => join(STATE_ROOT, project)

export const getManifestFile = (project) => join(getProjectDir(project), 'manifest.json')

export const getBeforeImagesDir = (project) => join(getProjectDir(project), 'beforeImages')

export const getServerFile = (project) => join(getProjectDir(project), 'server.json')

export const getTranscriptFile = (project, sessionId) => join(TRANSCRIPTS_ROOT, project, `${sessionId}.jsonl`)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getSessionIdFile = (project) => join(getProjectDir(project), 'sessionId.txt')

export const getSnapshotsFile = (project) => join(getProjectDir(project), 'snapshots.tsv')

export const getTouchListFile = (project) => join(getProjectDir(project), 'touchList.txt')

export const getTouchCopiesDir = (project) => join(getProjectDir(project), 'touchCopies')

export const getArmedTurnPaths = (project) => {
  return [getSessionIdFile(project), getSnapshotsFile(project), getTouchListFile(project), getTouchCopiesDir(project)]
}
