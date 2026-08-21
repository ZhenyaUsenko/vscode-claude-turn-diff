import { removeRecursive, listDirectories } from '../utils/files.js'
import { getChatsDir, getChatDir, getTranscriptFile } from '../utils/paths.js'
import fs from 'fs'
import path from 'path'

const beforeStamp = (name) => name.startsWith('before-') ? Number(name.slice('before-'.length)) : NaN

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const dropOwnSupersededTurns = (ownChatDir, currentBeforeDir) => {
  for (const name of listDirectories(ownChatDir)) {
    const candidateDir = path.join(ownChatDir, name)

    if (name.startsWith('before-') && candidateDir !== currentBeforeDir) removeRecursive(candidateDir)
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

export const purgeSupersededTurns = ({ project, sessionId, stamp, currentBeforeDir }) => {
  const chatsDir = getChatsDir(project)
  const ownChatDir = getChatDir(project, sessionId)
  const keyIsTrustworthy = fs.existsSync(getTranscriptFile(project, sessionId))

  dropOwnSupersededTurns(ownChatDir, currentBeforeDir)

  for (const name of listDirectories(chatsDir)) {
    const siblingDir = path.join(chatsDir, name)

    if (siblingDir === ownChatDir) continue

    if (keyIsTrustworthy && !fs.existsSync(getTranscriptFile(project, name))) {
      removeRecursive(siblingDir)

      continue
    }

    dropSiblingSupersededTurns(siblingDir, stamp)
  }
}
