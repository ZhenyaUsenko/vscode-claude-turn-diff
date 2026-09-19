import { showLastTurn } from '../../src/view.js'
import { resetStub, stubState } from './vscode-stub.js'
import { basename } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const render = async (workspaceDirs) => {
  resetStub(workspaceDirs)

  await showLastTurn({ force: true })

  return stubState.executed.findLast(({ command }) => command === 'vscode.changes')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listExecutedCommands = () => {
  return stubState.executed.map(({ command }) => command)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getRenderedFileNames = (diffData) => {
  return diffData.resources.map(([resourceUri]) => basename(resourceUri.fsPath))
}
