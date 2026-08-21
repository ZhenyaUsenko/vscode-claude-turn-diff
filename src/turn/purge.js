import { removeRecursive, listDirectories } from '../utils/files.js'
import { getChatsDir, getChatDir, getTranscriptFile } from '../utils/paths.js'
import { getBeforeStamp, isBeforeDirName } from './state.js'
import fs from 'fs'
import path from 'path'

const dropOwnSupersededTurns = (ownChatDir, currentBeforeDir) => {
  for (const dirName of listDirectories(ownChatDir)) {
    if (!isBeforeDirName(dirName)) continue

    const candidateDir = path.join(ownChatDir, dirName)

    if (candidateDir !== currentBeforeDir) removeRecursive(candidateDir)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const dropSiblingSupersededTurns = (siblingDir, stamp) => {
  for (const dirName of listDirectories(siblingDir)) {
    if (!isBeforeDirName(dirName)) continue

    const dirStamp = getBeforeStamp(dirName)

    if (dirStamp < stamp) removeRecursive(path.join(siblingDir, dirName))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const purgeSupersededTurns = ({ project, sessionId, stamp, currentBeforeDir }) => {
  const chatsDir = getChatsDir(project)
  const ownChatDir = getChatDir(project, sessionId)
  const keyIsTrustworthy = fs.existsSync(getTranscriptFile(project, sessionId))

  dropOwnSupersededTurns(ownChatDir, currentBeforeDir)

  for (const siblingSessionId of listDirectories(chatsDir)) {
    const siblingDir = path.join(chatsDir, siblingSessionId)

    if (siblingDir === ownChatDir) continue

    if (keyIsTrustworthy && !fs.existsSync(getTranscriptFile(project, siblingSessionId))) {
      removeRecursive(siblingDir)

      continue
    }

    dropSiblingSupersededTurns(siblingDir, stamp)
  }
}
