import fs from 'fs'
import path from 'path'

const removeRecursive = (target) => fs.rmSync(target, { recursive: true, force: true })

const isUnder = (child, parent) => child === parent || child.startsWith(parent + path.sep)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readLines = (file) => {
  try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) } catch { return [] }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listDirectories = (parent) => {
  try {
    const entries = fs.readdirSync(parent, { withFileTypes: true })

    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    return []
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const sameContents = (left, right) => {
  try {
    if (fs.statSync(left).size !== fs.statSync(right).size) return false

    return fs.readFileSync(left).equals(fs.readFileSync(right))
  } catch {
    return false
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const canonical = (target) => {
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

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { removeRecursive, readLines, listDirectories, sameContents, canonical, isUnder }
