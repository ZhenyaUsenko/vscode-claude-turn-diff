import { getFileSize, removeRecursive } from './files.js'
import { execFile } from 'node:child_process'
import { copyFileSync, mkdtempSync, statSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const MAX_UNTRACKED_BYTES = 1024 * 1024

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const git = (dir, command, { env, input, encoding = 'utf8' } = {}) => {
  return new Promise((resolve) => {
    const args = ['-C', dir, ...command.split(' ')]

    const options = { env: { ...process.env, ...env }, maxBuffer: Infinity, encoding }

    const childProcess = execFile('git', args, options, (error, stdout) => resolve(error ? null : stdout))

    childProcess.stdin.on('error', () => {})
    childProcess.stdin.end(input)
  })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const addUntrackedFiles = async (repoDir, { env }) => {
  const output = await git(repoDir, 'ls-files -o --exclude-standard -z', { env })

  const untrackedPaths = output?.split('\0').filter(Boolean) ?? []

  const input = untrackedPaths.filter((path) => getFileSize(join(repoDir, path)) <= MAX_UNTRACKED_BYTES).join('\0')

  if (!input) return

  await git(repoDir, '--literal-pathspecs add -f --pathspec-from-file=- --pathspec-file-nul', { env, input })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listRepos = async (workspaceDirs) => {
  const gitDirByRepoDir = new Map()

  for (const workspaceDir of workspaceDirs) {
    const output = await git(workspaceDir, 'rev-parse --show-toplevel --absolute-git-dir')

    if (output == null) continue

    const [repoDir, gitDir] = output.trim().split('\n')

    gitDirByRepoDir.set(repoDir, gitDir)
  }

  return [...gitDirByRepoDir].map(([repoDir, gitDir]) => ({ repoDir, gitDir }))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const snapshotTree = async (repoDir, gitDir) => {
  const scratchDir = mkdtempSync(join(tmpdir(), 'turn-diff-'))

  try {
    const indexFile = join(gitDir, 'index')
    const indexCopyFile = join(scratchDir, 'index')

    const { atime, mtime } = statSync(indexFile)

    copyFileSync(indexFile, indexCopyFile)
    utimesSync(indexCopyFile, atime, mtime)

    await git(repoDir, 'add -u', { env: { GIT_INDEX_FILE: indexCopyFile } })

    await addUntrackedFiles(repoDir, { env: { GIT_INDEX_FILE: indexCopyFile } })

    const output = await git(repoDir, 'write-tree', { env: { GIT_INDEX_FILE: indexCopyFile } })

    return output?.trim()
  } catch {
    return undefined
  } finally {
    removeRecursive(scratchDir)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const listChangedPaths = async (repoDir, treeBefore, treeAfter) => {
  let offset = 0

  const changedPaths = []

  const output = await git(repoDir, `diff --name-status -z -M ${treeBefore} ${treeAfter}`)

  const outputRecords = output?.split('\0').filter(Boolean) ?? []

  while (offset < outputRecords.length) {
    const afterOffset = outputRecords[offset].startsWith('R') ? 2 : 1

    changedPaths.push({ beforePath: outputRecords[offset + 1], afterPath: outputRecords[offset + afterOffset] })

    offset += afterOffset + 1
  }

  return changedPaths
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readBlobSizes = async (repoDir, treeBefore, changedPaths) => {
  const input = changedPaths.map((paths) => `${treeBefore}:${paths.beforePath}\0`).join('')

  const output = await git(repoDir, 'cat-file --batch-check -z', { input })

  const headers = output?.split('\n').slice(0, changedPaths.length)

  return headers?.map((header) => header.endsWith(' missing') ? 0 : +header.slice(header.lastIndexOf(' ') + 1))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const readBlobContents = async (repoDir, treeBefore, changedPaths) => {
  let offset = 0

  const blobContents = []

  const input = changedPaths.map((paths) => `${treeBefore}:${paths.beforePath}\0`).join('')

  const output = await git(repoDir, 'cat-file --batch -z', { input, encoding: 'buffer' })

  if (output == null) return undefined

  while (blobContents.length < changedPaths.length) {
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
