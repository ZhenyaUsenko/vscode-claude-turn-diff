import { getFileSize, removeFile } from './files.js'
import { execFile } from 'node:child_process'
import { copyFileSync, statSync, utimesSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024

const MAX_UNTRACKED_BYTES = 1024 * 1024

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const run = (args, env) => {
  return new Promise((resolve) => {
    const options = { env: { ...process.env, ...env }, maxBuffer: MAX_OUTPUT_BYTES, encoding: 'buffer' }

    execFile('git', args, options, (error, stdout) => resolve(error ? null : stdout))
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runText = async (args, env) => {
  const output = await run(args, env)

  return output?.toString('utf8').trim()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listPaths = async (args, env) => {
  const output = await run(args, env)

  return output?.toString('utf8').split('\0').filter(Boolean) ?? []
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listRepositories = async (folders) => {
  const gitDirByRoot = new Map()

  for (const folder of folders) {
    const output = await runText(['-C', folder, 'rev-parse', '--show-toplevel', '--absolute-git-dir'])

    if (output == null) continue

    const [root, gitDir] = output.split('\n')

    gitDirByRoot.set(root, gitDir)
  }

  return [...gitDirByRoot]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const copyPreservingMtime = (source, destination) => {
  copyFileSync(source, destination)

  const { atime, mtime } = statSync(source)

  utimesSync(destination, atime, mtime)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listSmallUntrackedFiles = async (repository, env) => {
  const listingArgs = ['-C', repository, 'ls-files', '-o', '--exclude-standard', '-z']

  const untrackedFiles = await listPaths(listingArgs, env)

  return untrackedFiles.filter((relativePath) => {
    return getFileSize(join(repository, relativePath)) <= MAX_UNTRACKED_BYTES
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const snapshotTree = async (repository, gitDir, scratchDir) => {
  const indexCopy = join(scratchDir, 'index.tmp')

  try { copyPreservingMtime(join(gitDir, 'index'), indexCopy) } catch { return null }

  const env = { GIT_INDEX_FILE: indexCopy }

  await run(['-C', repository, 'add', '-u'], env)

  const untrackedFiles = await listSmallUntrackedFiles(repository, env)

  if (untrackedFiles.length) await run(['-C', repository, 'add', '-f', '--', ...untrackedFiles], env)

  const tree = await runText(['-C', repository, 'write-tree'], env)

  removeFile(indexCopy)

  return tree
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const splitBlobs = (output, expectedCount) => {
  let offset = 0

  const blobs = []

  while (blobs.length < expectedCount) {
    const endOfHeader = output.indexOf(0x0a, offset)
    const header = output.toString('utf8', offset, endOfHeader)

    if (header.endsWith(' missing')) {
      blobs.push(null)

      offset = endOfHeader + 1
    } else {
      const size = +header.slice(header.lastIndexOf(' ') + 1)

      blobs.push(output.subarray(endOfHeader + 1, endOfHeader + 1 + size))

      offset = endOfHeader + 1 + size + 1
    }
  }

  return blobs
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const splitChanges = (records) => {
  let offset = 0

  const changes = []

  while (offset < records.length) {
    const renamed = records[offset].startsWith('R') || records[offset].startsWith('C')

    if (renamed) {
      changes.push({ beforePath: records[offset + 1], afterPath: records[offset + 2] })
    } else {
      changes.push({ beforePath: records[offset + 1], afterPath: records[offset + 1] })
    }

    offset += renamed ? 3 : 2
  }

  return changes
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listChanges = async (repository, treeBefore, treeAfter) => {
  const diffArgs = ['-C', repository, 'diff', '--name-status', '-z', '-M', treeBefore, treeAfter]

  return splitChanges(await listPaths(diffArgs))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readBlobs = (repository, tree, relativePaths) => {
  return new Promise((resolve) => {
    const options = { maxBuffer: MAX_OUTPUT_BYTES, encoding: 'buffer' }

    const resolveBlobs = (error, stdout) => resolve(error ? null : splitBlobs(stdout, relativePaths.length))

    const child = execFile('git', ['-C', repository, 'cat-file', '--batch', '-z'], options, resolveBlobs)

    child.stdin.end(relativePaths.map((relativePath) => `${tree}:${relativePath}\0`).join(''))
  })
}
