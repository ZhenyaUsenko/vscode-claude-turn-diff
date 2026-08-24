import { workspace } from 'vscode'

export const getWorkspaceDirs = () => workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []
