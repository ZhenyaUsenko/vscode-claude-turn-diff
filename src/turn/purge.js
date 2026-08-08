const fs = require('fs')
const path = require('path')

const { chatsDirFor, chatDirFor, transcriptFor } = require('../util/paths')
const { removeRecursive, listDirectories } = require('../util/files')

const beforeStamp = (name) => name.startsWith('before-') ? Number(name.slice('before-'.length)) : NaN

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const dropOwnSupersededTurns = (ownChatDir, currentBeforeDir) => {
  for (const name of listDirectories(ownChatDir)) {
    const dir = path.join(ownChatDir, name)

    if (name.startsWith('before-') && dir !== currentBeforeDir) removeRecursive(dir)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const dropSiblingSupersededTurns = (siblingDir, stamp) => {
  for (const entry of listDirectories(siblingDir)) {
    const stampOfEntry = beforeStamp(entry)

    if (Number.isInteger(stampOfEntry) && stampOfEntry < stamp) removeRecursive(path.join(siblingDir, entry))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const purgeSupersededTurns = ({ project, sessionId, stamp, currentBeforeDir }) => {
  const chatsDir = chatsDirFor(project)
  const ownChatDir = chatDirFor(project, sessionId)
  const keyIsTrustworthy = fs.existsSync(transcriptFor(project, sessionId))

  dropOwnSupersededTurns(ownChatDir, currentBeforeDir)

  for (const name of listDirectories(chatsDir)) {
    const siblingDir = path.join(chatsDir, name)

    if (siblingDir === ownChatDir) continue

    if (keyIsTrustworthy && !fs.existsSync(transcriptFor(project, name))) {
      removeRecursive(siblingDir)

      continue
    }

    dropSiblingSupersededTurns(siblingDir, stamp)
  }
}

module.exports = { purgeSupersededTurns }
