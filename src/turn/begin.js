// UserPromptSubmit: record the prompt and clear anything left from a turn that
// was interrupted. Deliberately does no git work — most turns are questions.

const fs = require('fs')
const path = require('path')

const { chatDirFor } = require('../util/paths')
const { removeRecursive } = require('../util/files')

// The raw prompt carries injected IDE and system context. Without stripping it
// the diff editor gets titled with whatever the IDE happened to append.
const cleanPrompt = (raw) => {
  const text = (raw || '')
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, '')
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, '')
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<local-command-[a-z]+>[\s\S]*?<\/local-command-[a-z]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, 120) : 'turn'
}

const begin = ({ workingDir, sessionId, payload }) => {
  const chatDir = chatDirFor(workingDir, sessionId)
  fs.mkdirSync(chatDir, { recursive: true })

  for (const stale of ['repos.tsv', 'touched.tsv', 'blobs']) {
    removeRecursive(path.join(chatDir, stale))
  }
  fs.writeFileSync(path.join(chatDir, 'prompt'), cleanPrompt(payload.prompt))
}

module.exports = { begin, cleanPrompt }
