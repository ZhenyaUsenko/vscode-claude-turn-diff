import { removeRecursive } from '../util/files.js'
import { chatDirFor } from '../util/paths.js'
import fs from 'fs'
import path from 'path'

const begin = ({ project, sessionId }) => {
  const chatDir = chatDirFor(project, sessionId)

  fs.mkdirSync(chatDir, { recursive: true })

  for (const staleEntry of ['repos.tsv', 'touched.tsv', 'blobs']) removeRecursive(path.join(chatDir, staleEntry))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { begin }
