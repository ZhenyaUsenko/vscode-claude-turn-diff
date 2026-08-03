// PreToolUse: capture the "before" state, before the tool it precedes runs.
//
// Two mechanisms, because neither covers everything on its own:
//   * tree snapshots catch anything a shell command does — rm, sed, a
//     formatter, package-lock churn — but only inside a git worktree
//   * per-file capture catches edits outside every repository, but only for
//     paths an Edit/Write tool names
//
// The repository snapshot happens once per turn; later calls fall through to
// the cheap per-file branch, which is why this stays affordable on a turn with
// dozens of tool calls.

const fs = require('fs')
const path = require('path')

const { chatDirFor } = require('../util/paths')
const { readLines, canonical, isUnder } = require('../util/files')
const { listRepositories, snapshotTree } = require('../util/git')

const snapshotWorkspace = async (chatDir, workspaceFolders) => {
  const snapshots = []
  for (const repository of await listRepositories(workspaceFolders)) {
    const tree = await snapshotTree(repository, chatDir)
    if (tree) snapshots.push([repository, tree])
  }
  const body = snapshots.map((entry) => entry.join('\t')).join('\n')
  fs.writeFileSync(path.join(chatDir, 'repos.tsv'), snapshots.length ? `${body}\n` : '')
  return snapshots
}

const targetedFile = (payload) => {
  const input = payload.tool_input || {}
  const file = input.file_path || input.notebook_path
  return file && path.isAbsolute(file) ? file : null
}

const arm = async ({ workingDir, sessionId, payload, workspaceFolders }) => {
  const chatDir = chatDirFor(workingDir, sessionId)
  fs.mkdirSync(chatDir, { recursive: true })

  const reposFile = path.join(chatDir, 'repos.tsv')
  const repositories = fs.existsSync(reposFile)
    ? readLines(reposFile).map((line) => line.split('\t'))
    : await snapshotWorkspace(chatDir, workspaceFolders)

  const file = targetedFile(payload)
  if (!file) return
  if (repositories.some(([repository]) => isUnder(canonical(file), repository))) return

  const touchedFile = path.join(chatDir, 'touched.tsv')
  const alreadySeen = readLines(touchedFile).map((line) => line.split('\t')[0])
  if (alreadySeen.includes(file)) return // keep the oldest before-image

  if (fs.existsSync(file)) {
    const copy = path.join(chatDir, 'blobs', file)
    fs.mkdirSync(path.dirname(copy), { recursive: true })
    fs.copyFileSync(file, copy)
    fs.appendFileSync(touchedFile, `${file}\t1\n`)
  } else {
    fs.appendFileSync(touchedFile, `${file}\t0\n`) // did not exist yet
  }
}

module.exports = { arm }
