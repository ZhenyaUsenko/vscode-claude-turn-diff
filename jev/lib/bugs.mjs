import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HOOK_PROJECT_LINES = [
  'PROJECT=${payload#*\\"transcript_path\\":\\"}',
  'PROJECT=${PROJECT%%\\"*}',
  'PROJECT=${PROJECT%/*}',
  'PROJECT=${PROJECT##*/}',
].join('\n')

export const BUGS = {
  'startup-rename': {
    summary: 'extension.js imports and calls startHookServer, but server.js still exports the function as startServer',
    edits: [
      {
        file: 'src/extension.js',
        find: "import { startServer } from './server.js'",
        replace: "import { startHookServer } from './server.js'",
      },
      {
        file: 'src/extension.js',
        find: 'const server = startServer(logError, onPublish)',
        replace: 'const server = startHookServer(logError, onPublish)',
      },
    ],
  },
  'sync-await': {
    summary: 'collectOutsideChanges, a synchronous function, awaits readFile, a syntax error in collect.js',
    edits: [
      {
        file: 'src/turn/collect.js',
        find: 'const beforeContents = readFile(join(getTouchCopiesDir(project), touchedFile))',
        replace: 'const beforeContents = await readFile(join(getTouchCopiesDir(project), touchedFile))',
      },
    ],
  },
  'binary-default': {
    summary: 'isBinary defaults to true when a side is missing, so every added and deleted file is skipped as binary',
    edits: [
      {
        file: 'src/turn/collect.js',
        find: 'return contents?.subarray(0, BINARY_SNIFF_BYTES).includes(0) ?? false',
        replace: 'return contents?.subarray(0, BINARY_SNIFF_BYTES).includes(0) ?? true',
      },
    ],
  },
  'tree-order': {
    summary: 'compareFilesInTreeOrder puts files before folders',
    edits: [
      {
        file: 'src/utils/files.js',
        find: 'if (leftIsDir !== rightIsDir) return leftIsDir ? -1 : 1',
        replace: 'if (leftIsDir !== rightIsDir) return leftIsDir ? 1 : -1',
      },
    ],
  },
  'index-mtime': {
    summary: 'snapshotTree copies the git index with a plain copy that gives it a fresh mtime',
    edits: [
      {
        file: 'src/utils/git.js',
        find: "try { copyPreservingMtime(join(gitDir, 'index'), indexCopyFile) }",
        replace: "try { copyFileSync(join(gitDir, 'index'), indexCopyFile) }",
      },
    ],
  },
  'prompt-id': {
    summary: 'beginTurn clears the armed turn on every prompt-submitted event, even one with the same prompt id',
    edits: [
      {
        file: 'src/turn/index.js',
        find: "  if (payload.prompt_id === readFile(getPromptIdFile(project), 'utf8')) return\n\n",
        replace: '',
      },
    ],
  },
  'interrupt-equality': {
    summary: 'isEndOfTurn compares the whole user entry text to the interrupt marker instead of checking its prefix',
    edits: [
      {
        file: 'src/store/transcript.js',
        find: 'return getEntryText(entry).trim().startsWith(INTERRUPT_MARKER)',
        replace: 'return getEntryText(entry).trim() === INTERRUPT_MARKER',
      },
    ],
  },
  'advert-withdraw': {
    summary: 'withdrawAdvert removes the advert file without checking it still holds this window\'s advert',
    edits: [
      {
        file: 'src/server.js',
        find: "if (readFile(writtenFile, 'utf8') === writtenContents) removeFile(writtenFile)",
        replace: 'removeFile(writtenFile)',
      },
    ],
  },
  'hook-cwd': {
    summary: 'the hook script derives the project key from $PWD instead of the transcript path',
    edits: [{ file: 'hooks/turn-diff.sh', find: HOOK_PROJECT_LINES, replace: 'PROJECT=${PWD//[^a-zA-Z0-9]/-}' }],
  },
  'stamp-seconds': {
    summary: 'the manifest stamp uses whole seconds instead of milliseconds',
    edits: [
      {
        file: 'src/store/manifest.js',
        find: 'ts: `${Date.now()}-${process.pid}`',
        replace: 'ts: `${Math.floor(Date.now() / 1000)}-${process.pid}`',
      },
    ],
  },
  'empty-image': {
    summary: 'addChange writes a before-image only when the old contents are non-empty',
    edits: [
      {
        file: 'src/turn/collect.js',
        find: 'if (beforeContents != null) collector.images.push({ beforeFile, beforeContents })',
        replace: 'if (beforeContents?.length) collector.images.push({ beforeFile, beforeContents })',
      },
    ],
  },
  'pure-rename-dropped': {
    summary: 'addChange drops any change whose contents are unchanged, so a pure move vanishes',
    edits: [
      {
        file: 'src/turn/collect.js',
        find: 'if (beforeFile === afterFile && afterContents && beforeContents?.equals(afterContents))',
        replace: 'if (afterContents && beforeContents?.equals(afterContents))',
      },
    ],
  },
  'subagent-end': {
    summary: 'endTurn no longer ignores end events that carry an agent_id',
    edits: [
      {
        file: 'src/turn/index.js',
        find: '  if (payload?.agent_id) return { published: false }\n\n',
        replace: '',
      },
    ],
  },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const BUG_NAMES = ['clean', ...Object.keys(BUGS)]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const applyBug = (codeDir, name) => {
  if (name === 'clean') return

  if (!BUGS[name]) throw new Error(`unknown bug ${name}`)

  for (const { file, find, replace } of BUGS[name].edits) {
    const targetFile = join(codeDir, file)
    const contents = readFileSync(targetFile, 'utf8')
    const matchCount = contents.split(find).length - 1

    if (matchCount !== 1) throw new Error(`${name}: expected one match in ${file}, found ${matchCount}`)

    writeFileSync(targetFile, contents.replace(find, () => replace))
  }
}
