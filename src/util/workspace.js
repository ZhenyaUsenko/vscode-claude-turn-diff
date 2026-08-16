const vscode = require('vscode')

const getWorkspaceFolders = () => vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = { getWorkspaceFolders }
