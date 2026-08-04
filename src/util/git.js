const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

const { MAX_UNTRACKED_BYTES } = require('../config')

// Every call resolves rather than rejects: a failed git invocation is an
// expected outcome here (no HEAD yet, a path outside a repository, a ref that
// does not exist) and callers branch on null.
const run = (args, env) =>
  new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        env: env ? { ...process.env, ...env } : process.env,
        maxBuffer: 64 * 1024 * 1024,
        encoding: 'buffer',
      },
      (error, stdout) => resolve(error ? null : stdout),
    )
  })

const text = async (args, env) => {
  const output = await run(args, env)
  return output === null ? null : output.toString('utf8').trim()
}

const nulSeparated = async (args, env) => {
  const output = await run(args, env)
  return output === null ? [] : output.toString('utf8').split('\0').filter(Boolean)
}

// Every distinct worktree among the workspace folders. Two folders in the same
// repository collapse to one entry.
const listRepositories = async (folders) => {
  const roots = new Set()
  for (const folder of folders) {
    const root = await text(['-C', folder, 'rev-parse', '--show-toplevel'])
    if (root) roots.add(root)
  }
  return [...roots]
}

// Snapshot one worktree as a tree object without touching its real index: the
// index is copied aside and GIT_INDEX_FILE points git at the copy, so the
// user's staging area is never disturbed.
const copyPreservingMtime = (source, destination) => {
  fs.copyFileSync(source, destination)
  const { atime, mtime } = fs.statSync(source)
  fs.utimesSync(destination, atime, mtime)
}

const snapshotTree = async (repository, scratchDir) => {
  const gitDir = await text(['-C', repository, 'rev-parse', '--absolute-git-dir'])
  if (!gitDir) return null

  const indexCopy = path.join(scratchDir, 'index.tmp')
  try {
    copyPreservingMtime(path.join(gitDir, 'index'), indexCopy)
  } catch {
    return null
  }
  const env = { GIT_INDEX_FILE: indexCopy }

  await run(['-C', repository, 'add', '-u'], env)

  const untracked = await nulSeparated(
    ['-C', repository, 'ls-files', '-o', '--exclude-standard', '-z'],
    env,
  )
  const smallEnough = untracked.filter((relative) => {
    try {
      return fs.statSync(path.join(repository, relative)).size <= MAX_UNTRACKED_BYTES
    } catch {
      return false
    }
  })
  if (smallEnough.length) {
    await run(['-C', repository, 'add', '-f', '--', ...smallEnough], env)
  }

  const tree = await text(['-C', repository, 'write-tree'], env)
  fs.unlinkSync(indexCopy)
  return tree
}

// numstat prints "-" for added and deleted lines on binary files.
const isBinaryChange = async (repository, fromTree, toTree, relative) => {
  const stat = await text(['-C', repository, 'diff', '--numstat', fromTree, toTree, '--', relative])
  return Boolean(stat && stat.startsWith('-'))
}

module.exports = { run, text, nulSeparated, listRepositories, snapshotTree, isBinaryChange }
