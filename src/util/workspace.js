import * as vscode from 'vscode'

export const getWorkspaceFolders = () => vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []
