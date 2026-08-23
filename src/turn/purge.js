import { getBeforeStamp, getChatDir, getChatsDir, getTranscriptFile, isBeforeDirName } from '../store/paths.js'
import { removeRecursive, listDirNames } from '../utils/files.js'
import { existsSync } from 'fs'
import { join } from 'path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const dropOwnSupersededTurns = (ownChatDir, currentBeforeDir) => {
  for (const dirName of listDirNames(ownChatDir)) {
    if (!isBeforeDirName(dirName)) continue

    const candidateDir = join(ownChatDir, dirName)

    if (candidateDir !== currentBeforeDir) removeRecursive(candidateDir)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const dropSiblingSupersededTurns = (siblingDir, stamp) => {
  for (const dirName of listDirNames(siblingDir)) {
    if (!isBeforeDirName(dirName)) continue

    if (getBeforeStamp(dirName) < stamp) removeRecursive(join(siblingDir, dirName))
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const purgeSupersededTurns = ({ project, sessionId, stamp, currentBeforeDir }) => {
  const chatsDir = getChatsDir(project)
  const ownChatDir = getChatDir(project, sessionId)
  const keyIsTrustworthy = existsSync(getTranscriptFile(project, sessionId))

  dropOwnSupersededTurns(ownChatDir, currentBeforeDir)

  for (const siblingSessionId of listDirNames(chatsDir)) {
    const siblingDir = join(chatsDir, siblingSessionId)

    if (siblingDir === ownChatDir) continue

    if (keyIsTrustworthy && !existsSync(getTranscriptFile(project, siblingSessionId))) {
      removeRecursive(siblingDir)
    } else {
      dropSiblingSupersededTurns(siblingDir, stamp)
    }
  }
}
