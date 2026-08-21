import { removeRecursive } from '../utils/files.js'
import { getChatDir } from '../utils/paths.js'
import { getArmedTurnEntries } from './state.js'
import fs from 'fs'

export const beginTurn = ({ project, sessionId }) => {
  const chatDir = getChatDir(project, sessionId)

  fs.mkdirSync(chatDir, { recursive: true })

  for (const entryPath of getArmedTurnEntries(chatDir)) removeRecursive(entryPath)
}
