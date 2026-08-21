import { removeRecursive } from '../utils/files.js'
import { getChatDir } from '../utils/paths.js'
import fs from 'fs'
import path from 'path'

export const beginTurn = ({ project, sessionId }) => {
  const chatDir = getChatDir(project, sessionId)

  fs.mkdirSync(chatDir, { recursive: true })

  for (const staleEntry of ['repos.tsv', 'touched.tsv', 'blobs']) removeRecursive(path.join(chatDir, staleEntry))
}
