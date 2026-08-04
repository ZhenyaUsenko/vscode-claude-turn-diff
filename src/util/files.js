const fs = require('fs')
const path = require('path')

const removeRecursive = (target) => fs.rmSync(target, { recursive: true, force: true })

const readLines = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
  } catch {
    return []
  }
}

const listDirectories = (parent) => {
  try {
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

const sameContents = (left, right) => {
  try {
    if (fs.statSync(left).size !== fs.statSync(right).size) return false
    return fs.readFileSync(left).equals(fs.readFileSync(right))
  } catch {
    return false
  }
}

// git reports canonical paths, so a symlinked working directory — /var being
// /private/var on macOS, or a symlinked checkout — would never look like it was
// inside its own repository. Used for containment tests only: project keys must
// stay derived from the literal path or they stop matching the hook's.
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

const isUnder = (child, parent) => child === parent || child.startsWith(parent + path.sep)

module.exports = { removeRecursive, readLines, listDirectories, sameContents, canonical, isUnder }
