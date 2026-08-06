// Everything is reclaimed by events rather than by age. A finishing turn knows
// exactly which state its own manifest has just superseded, so there is no
// need for a scheduled sweep.

const fs = require('fs')
const path = require('path')

const { chatsDirFor, chatDirFor, transcriptFor } = require('../util/paths')
const { removeRecursive, listDirectories } = require('../util/files')

const beforeStamp = (name) =>
  name.startsWith('before-') ? Number(name.slice('before-'.length)) : NaN

const purgeSupersededTurns = ({ project, sessionId, stamp, currentBeforeDir }) => {
  const chatsDir = chatsDirFor(project)
  const ownChatDir = chatDirFor(project, sessionId)

  for (const name of listDirectories(ownChatDir)) {
    const dir = path.join(ownChatDir, name)
    if (name.startsWith('before-') && dir !== currentBeforeDir) removeRecursive(dir)
  }

  // Finding our own transcript proves the project key maps onto Claude Code's
  // the way we expect. Without that check a mismatched key would make every
  // sibling look deleted.
  const keyIsTrustworthy = fs.existsSync(transcriptFor(project, sessionId))

  for (const name of listDirectories(chatsDir)) {
    const siblingDir = path.join(chatsDir, name)
    if (siblingDir === ownChatDir) continue

    // A chat that no longer exists takes its whole directory. Nothing else
    // ever reclaims it: the sweep below leaves `prompt`, and anything an
    // abandoned mid-turn chat left behind, sitting there indefinitely.
    if (keyIsTrustworthy && !fs.existsSync(transcriptFor(project, name))) {
      removeRecursive(siblingDir)
      continue
    }

    // Superseded turns of chats that still exist. Only ones strictly OLDER
    // than this turn: two chats finishing in the same second must not delete
    // each other's images and leave the winning manifest dangling.
    for (const entry of listDirectories(siblingDir)) {
      const stampOfEntry = beforeStamp(entry)
      if (Number.isInteger(stampOfEntry) && stampOfEntry < stamp) {
        removeRecursive(path.join(siblingDir, entry))
      }
    }
  }
}

module.exports = { purgeSupersededTurns }
