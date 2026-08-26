import { getProjectKey } from '../store/paths.js'
import { homedir } from 'node:os'
import { workspace } from 'vscode'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getWorkspaceDirs = () => workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []

export const getCurrentProject = () => getProjectKey(getWorkspaceDirs()[0] ?? homedir())
