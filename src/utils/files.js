import { readdirSync, readFileSync, realpathSync, rmSync, statSync } from 'fs'
import path from 'path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const removeRecursive = (target) => {
  rmSync(target, { recursive: true, force: true })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const isUnder = (child, parent) => {
  return child === parent || child.startsWith(parent + path.sep)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readLines = (file) => {
  try {
    return readFileSync(file, 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listDirectories = (parentDir) => {
  try {
    const entries = readdirSync(parentDir, { withFileTypes: true })

    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const sameContents = (left, right) => {
  try {
    if (statSync(left).size !== statSync(right).size) return false

    return readFileSync(left).equals(readFileSync(right))
  } catch {
    return false
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const canonicalize = (target) => {
  try {
    return realpathSync(target)
  } catch {
    try {
      return path.join(realpathSync(path.dirname(target)), path.basename(target))
    } catch {
      return target
    }
  }
}
