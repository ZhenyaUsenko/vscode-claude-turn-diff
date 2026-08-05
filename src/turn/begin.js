// UserPromptSubmit: clear anything left from a turn that was interrupted.
// Deliberately does no git work — most turns are questions.

const fs = require('fs')
const path = require('path')

const { chatDirFor } = require('../util/paths')
const { removeRecursive } = require('../util/files')

const begin = ({ workingDir, sessionId }) => {
  const chatDir = chatDirFor(workingDir, sessionId)
  fs.mkdirSync(chatDir, { recursive: true })

  for (const stale of ['repos.tsv', 'touched.tsv', 'blobs']) {
    removeRecursive(path.join(chatDir, stale))
  }
}

module.exports = { begin }
