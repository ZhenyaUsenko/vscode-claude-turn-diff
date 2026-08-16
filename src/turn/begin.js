const { removeRecursive } = require('../util/files')
const { chatDirFor } = require('../util/paths')
const fs = require('fs')
const path = require('path')

const begin = ({ project, sessionId }) => {
  const chatDir = chatDirFor(project, sessionId)

  fs.mkdirSync(chatDir, { recursive: true })

  for (const staleEntry of ['repos.tsv', 'touched.tsv', 'blobs']) removeRecursive(path.join(chatDir, staleEntry))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

module.exports = { begin }
