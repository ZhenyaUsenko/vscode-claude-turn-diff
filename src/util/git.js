import { MAX_UNTRACKED_BYTES } from '../config.js'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'

const run = (args, env) => new Promise((resolve) => {
  const childEnv = env ? { ...process.env, ...env } : process.env
  const options = { env: childEnv, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' }

  execFile('git', args, options, (error, stdout) => resolve(error ? null : stdout))
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runText = async (args, env) => {
  const output = await run(args, env)

  return output === null ? null : output.toString('utf8').trim()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runNulSeparated = async (args, env) => {
  const output = await run(args, env)

  return output === null ? [] : output.toString('utf8').split('\0').filter(Boolean)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listRepositories = async (folders) => {
  const repositoryRoots = new Set()

  for (const folder of folders) {
    const root = await runText(['-C', folder, 'rev-parse', '--show-toplevel'])

    if (root) repositoryRoots.add(root)
  }

  return [...repositoryRoots]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const copyPreservingMtime = (source, destination) => {
  fs.copyFileSync(source, destination)

  const { atime, mtime } = fs.statSync(source)

  fs.utimesSync(destination, atime, mtime)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const smallUntrackedFiles = async (repository, env) => {
  const listingArgs = ['-C', repository, 'ls-files', '-o', '--exclude-standard', '-z']

  const untrackedFiles = await runNulSeparated(listingArgs, env)

  return untrackedFiles.filter((relativePath) => {
    try {
      return fs.statSync(path.join(repository, relativePath)).size <= MAX_UNTRACKED_BYTES
    } catch {
      return false
    }
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const snapshotTree = async (repository, scratchDir) => {
  const gitDir = await runText(['-C', repository, 'rev-parse', '--absolute-git-dir'])

  if (!gitDir) return null

  const indexCopy = path.join(scratchDir, 'index.tmp')

  try {
    copyPreservingMtime(path.join(gitDir, 'index'), indexCopy)
  } catch {
    return null
  }

  const env = { GIT_INDEX_FILE: indexCopy }

  await run(['-C', repository, 'add', '-u'], env)

  const untrackedFiles = await smallUntrackedFiles(repository, env)

  if (untrackedFiles.length) await run(['-C', repository, 'add', '-f', '--', ...untrackedFiles], env)

  const tree = await runText(['-C', repository, 'write-tree'], env)

  fs.unlinkSync(indexCopy)

  return tree
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isBinaryChange = async (repository, fromTree, toTree, relativePath) => {
  const numstatArgs = ['-C', repository, 'diff', '--numstat', fromTree, toTree, '--', relativePath]

  const numstat = await runText(numstatArgs)

  return Boolean(numstat && numstat.startsWith('-'))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { run, runNulSeparated, listRepositories, snapshotTree, isBinaryChange }
