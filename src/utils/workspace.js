import { workspace } from 'vscode'

export const getWorkspaceFolders = () => workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []
