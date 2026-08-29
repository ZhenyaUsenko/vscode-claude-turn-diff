import {
  closeSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync,
  readSync, realpathSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { basename, dirname, join, sep as PATH_SEPARATOR } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true })

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readFile = (file, encoding) => {
  try { return readFileSync(file, encoding) } catch { return undefined }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getFileSize = (file) => {
  try { return statSync(file).size } catch { return undefined }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const getRealPath = (targetPath) => {
  try { return realpathSync(targetPath) } catch { return undefined }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listEntries = (dir) => {
  try { return readdirSync(dir, { withFileTypes: true }) } catch { return [] }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const outputFile = (file, contents, options) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents, options)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const removeFile = (file) => {
  rmSync(file, { force: true })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const removeRecursive = (targetPath) => {
  rmSync(targetPath, { recursive: true, force: true })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const isUnder = (child, parent) => {
  return child === parent || child.startsWith(parent + PATH_SEPARATOR)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readLines = (file) => {
  return readFile(file, 'utf8')?.split('\n').filter(Boolean) ?? []
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const sameContents = (left, right) => {
  if (+getFileSize(left) !== +getFileSize(right)) return false

  return readFile(left).equals(readFile(right))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const canonicalize = (targetPath) => {
  const realPath = getRealPath(targetPath)

  if (realPath) return realPath

  const realParent = getRealPath(dirname(targetPath))

  return realParent ? join(realParent, basename(targetPath)) : targetPath
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readFileTail = (file, maxBytes) => {
  let descriptor

  try {
    descriptor = openSync(file, 'r')

    const size = fstatSync(descriptor).size
    const length = Math.min(size, maxBytes)
    const buffer = Buffer.alloc(length)

    readSync(descriptor, buffer, 0, length, size - length)

    return buffer.toString('utf8')
  } catch {
    return undefined
  } finally {
    if (descriptor != null) closeSync(descriptor)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const compareFilesInTreeOrder = (a, b) => {
  const left = a.split(PATH_SEPARATOR)
  const right = b.split(PATH_SEPARATOR)
  const sharedLength = Math.min(left.length, right.length)

  for (let index = 0; index < sharedLength; index++) {
    if (left[index] === right[index]) continue

    const leftIsDir = index < left.length - 1
    const rightIsDir = index < right.length - 1

    if (leftIsDir !== rightIsDir) return leftIsDir ? -1 : 1

    return NAME_COLLATOR.compare(left[index], right[index])
  }

  return left.length - right.length
}
