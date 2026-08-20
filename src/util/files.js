import fs from 'fs'
import path from 'path'

export const removeRecursive = (target) => fs.rmSync(target, { recursive: true, force: true })

export const isUnder = (child, parent) => child === parent || child.startsWith(parent + path.sep)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readLines = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listDirectories = (parent) => {
  try {
    const entries = fs.readdirSync(parent, { withFileTypes: true })

    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const sameContents = (left, right) => {
  try {
    if (fs.statSync(left).size !== fs.statSync(right).size) return false

    return fs.readFileSync(left).equals(fs.readFileSync(right))
  } catch {
    return false
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const canonicalize = (target) => {
  try {
    return fs.realpathSync(target)
  } catch {
    try {
      return path.join(fs.realpathSync(path.dirname(target)), path.basename(target))
    } catch {
      return target
    }
  }
}
