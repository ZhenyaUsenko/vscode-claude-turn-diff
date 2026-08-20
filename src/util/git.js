import { MAX_UNTRACKED_BYTES } from '../config.js'
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const run = (args, env) => new Promise((resolve) => {
  const childEnv = env ? { ...process.env, ...env } : process.env
  const options = { env: childEnv, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'buffer' }

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
  const gitDirByRoot = new Map()

  for (const folder of folders) {
    const output = await runText(['-C', folder, 'rev-parse', '--show-toplevel', '--absolute-git-dir'])

    const [root, gitDir] = output === null ? [] : output.split('\n')

    if (root && gitDir) gitDirByRoot.set(root, gitDir)
  }

  return [...gitDirByRoot]
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

const snapshotTree = async (repository, gitDir, scratchDir) => {
  const indexCopy = path.join(scratchDir, 'index.tmp')

  try { copyPreservingMtime(path.join(gitDir, 'index'), indexCopy) } catch { return null }

  const env = { GIT_INDEX_FILE: indexCopy }

  await run(['-C', repository, 'add', '-u'], env)

  const untrackedFiles = await smallUntrackedFiles(repository, env)

  if (untrackedFiles.length) await run(['-C', repository, 'add', '-f', '--', ...untrackedFiles], env)

  const tree = await runText(['-C', repository, 'write-tree'], env)

  fs.unlinkSync(indexCopy)

  return tree
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const splitBlobs = (output, expected) => {
  let at = 0

  const blobs = []

  while (blobs.length < expected) {
    const endOfHeader = output.indexOf(0x0a, at)
    const header = output.toString('utf8', at, endOfHeader)

    if (header.endsWith(' missing')) {
      blobs.push(null)

      at = endOfHeader + 1
    } else {
      const size = Number(header.slice(header.lastIndexOf(' ') + 1))

      blobs.push(output.subarray(endOfHeader + 1, endOfHeader + 1 + size))

      at = endOfHeader + 1 + size + 1
    }
  }

  return blobs
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readBlobs = (repository, tree, relativePaths) => new Promise((resolve) => {
  const options = { maxBuffer: MAX_OUTPUT_BYTES, encoding: 'buffer' }

  const collect = (error, stdout) => resolve(error ? null : splitBlobs(stdout, relativePaths.length))

  const child = execFile('git', ['-C', repository, 'cat-file', '--batch', '-z'], options, collect)

  child.stdin.end(relativePaths.map((relativePath) => `${tree}:${relativePath}\0`).join(''))
})

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { run, runNulSeparated, listRepositories, snapshotTree, readBlobs }
