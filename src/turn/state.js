import path from 'path'

const BEFORE_PREFIX = 'before-'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getReposFile = (chatDir) => path.join(chatDir, 'repos.tsv')

export const getTouchesFile = (chatDir) => path.join(chatDir, 'touches.tsv')

export const getBlobsDir = (chatDir) => path.join(chatDir, 'blobs')

export const getArmedTurnEntries = (chatDir) => [getReposFile(chatDir), getTouchesFile(chatDir), getBlobsDir(chatDir)]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getBeforeDir = (chatDir, stamp) => path.join(chatDir, `${BEFORE_PREFIX}${stamp}`)

export const isBeforeDirName = (dirName) => dirName.startsWith(BEFORE_PREFIX)

export const getBeforeStamp = (dirName) => Number(dirName.slice(BEFORE_PREFIX.length))
