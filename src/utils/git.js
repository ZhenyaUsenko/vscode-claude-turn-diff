import { getFileSize, removeRecursive } from './files.js'
import { execFile } from 'node:child_process'
import { copyFileSync, mkdtempSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

const runNullSeparated = async (args, env) => {
  const output = await run(args, env)

  return output?.toString('utf8').split('\0').filter(Boolean) ?? []
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listRepos = async (workspaceDirs) => {
  const gitDirByRepoDir = new Map()

  for (const workspaceDir of workspaceDirs) {
    const output = await runText(['-C', workspaceDir, 'rev-parse', '--show-toplevel', '--absolute-git-dir'])

    if (output == null) continue

    const [repoDir, gitDir] = output.split('\n')

    gitDirByRepoDir.set(repoDir, gitDir)
  }

  return [...gitDirByRepoDir].map(([repoDir, gitDir]) => ({ repoDir, gitDir }))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const copyPreservingMtime = (source, destination) => {
  copyFileSync(source, destination)

  const { atime, mtime } = statSync(source)

  utimesSync(destination, atime, mtime)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listSmallUntrackedFiles = async (repoDir, env) => {
  const listingArgs = ['-C', repoDir, 'ls-files', '-o', '--exclude-standard', '-z']

  const untrackedPaths = await runNullSeparated(listingArgs, env)

  return untrackedPaths.filter((untrackedPath) => {
    return getFileSize(join(repoDir, untrackedPath)) <= MAX_UNTRACKED_BYTES
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const snapshotTree = async (repoDir, gitDir) => {
  const scratchDir = mkdtempSync(join(tmpdir(), 'turn-diff-'))
  const indexCopyFile = join(scratchDir, 'index')

  try { copyPreservingMtime(join(gitDir, 'index'), indexCopyFile) } catch { return void removeRecursive(scratchDir) }

  const env = { GIT_INDEX_FILE: indexCopyFile }

  await run(['-C', repoDir, 'add', '-u'], env)

  const untrackedPaths = await listSmallUntrackedFiles(repoDir, env)

  if (untrackedPaths.length) await run(['-C', repoDir, 'add', '-f', '--', ...untrackedPaths], env)

  const tree = await runText(['-C', repoDir, 'write-tree'], env)

  removeRecursive(scratchDir)

  return tree
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const splitBlobContents = (output, expectedCount) => {
  let offset = 0

  const blobContents = []

  while (blobContents.length < expectedCount) {
    const endOfHeader = output.indexOf(0x0a, offset)
    const header = output.toString('utf8', offset, endOfHeader)

    if (header.endsWith(' missing')) {
      blobContents.push(null)

      offset = endOfHeader + 1
    } else {
      const size = +header.slice(header.lastIndexOf(' ') + 1)

      blobContents.push(output.subarray(endOfHeader + 1, endOfHeader + 1 + size))

      offset = endOfHeader + 1 + size + 1
    }
  }

  return blobContents
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const splitChangedPaths = (nameStatusRecords) => {
  let offset = 0

  const changedPaths = []

  while (offset < nameStatusRecords.length) {
    const renamed = nameStatusRecords[offset].startsWith('R') || nameStatusRecords[offset].startsWith('C')

    const beforePath = nameStatusRecords[offset + 1]
    const afterPath = renamed ? nameStatusRecords[offset + 2] : beforePath

    changedPaths.push({ beforePath, afterPath })

    offset += renamed ? 3 : 2
  }

  return changedPaths
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listChangedPaths = async (repoDir, treeBefore, treeAfter) => {
  const diffArgs = ['-C', repoDir, 'diff', '--name-status', '-z', '-M', treeBefore, treeAfter]

  return splitChangedPaths(await runNullSeparated(diffArgs))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readBlobContents = (repoDir, tree, treePaths) => {
  return new Promise((resolve) => {
    const options = { maxBuffer: MAX_OUTPUT_BYTES, encoding: 'buffer' }

    const resolveContents = (error, stdout) => resolve(error ? null : splitBlobContents(stdout, treePaths.length))

    const child = execFile('git', ['-C', repoDir, 'cat-file', '--batch', '-z'], options, resolveContents)

    child.stdin.end(treePaths.map((treePath) => `${tree}:${treePath}\0`).join(''))
  })
}
