const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

const { MAX_UNTRACKED_BYTES } = require('../config')

const run = (args, env) => new Promise((resolve) => {
  const childEnv = env ? { ...process.env, ...env } : process.env
  const options = { env: childEnv, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' }

  execFile('git', args, options, (error, stdout) => resolve(error ? null : stdout))
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const text = async (args, env) => {
  const output = await run(args, env)

  return output === null ? null : output.toString('utf8').trim()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const nulSeparated = async (args, env) => {
  const output = await run(args, env)

  return output === null ? [] : output.toString('utf8').split('\0').filter(Boolean)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listRepositories = async (folders) => {
  const roots = new Set()

  for (const folder of folders) {
    const root = await text(['-C', folder, 'rev-parse', '--show-toplevel'])

    if (root) roots.add(root)
  }

  return [...roots]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const copyPreservingMtime = (source, destination) => {
  fs.copyFileSync(source, destination)

  const { atime, mtime } = fs.statSync(source)

  fs.utimesSync(destination, atime, mtime)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const smallUntrackedFiles = async (repository, env) => {
  const listing = ['-C', repository, 'ls-files', '-o', '--exclude-standard', '-z']

  const untracked = await nulSeparated(listing, env)

  return untracked.filter((relative) => {
    try {
      return fs.statSync(path.join(repository, relative)).size <= MAX_UNTRACKED_BYTES
    } catch {
      return false
    }
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

  const untracked = await smallUntrackedFiles(repository, env)

  if (untracked.length) await run(['-C', repository, 'add', '-f', '--', ...untracked], env)

  const tree = await text(['-C', repository, 'write-tree'], env)

  fs.unlinkSync(indexCopy)

  return tree
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isBinaryChange = async (repository, fromTree, toTree, relative) => {
  const numstat = ['-C', repository, 'diff', '--numstat', fromTree, toTree, '--', relative]

  const stat = await text(numstat)

  return Boolean(stat && stat.startsWith('-'))
}

module.exports = { run, text, nulSeparated, listRepositories, snapshotTree, isBinaryChange }
