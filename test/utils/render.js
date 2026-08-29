import { showLastTurn } from '../../src/view.js'
import { resetStub, stubState } from './vscode-stub.js'
import { basename } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const render = async (workspaceDirs) => {
  resetStub(workspaceDirs)

  await showLastTurn({ force: true })

  return stubState.executed[stubState.executed.length - 1]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getRenderedFileNames = (diffData) => {
  return diffData.resources.map(([resourceUri]) => basename(resourceUri.fsPath))
}
