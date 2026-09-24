import { REPO_DIR } from '../../lib/paths.mjs'
import { execFileSync } from 'node:child_process'

const MODEL = 'jev-latest'

const COMMITS = [
  ['95fad41', 'bugfix'],
  ['9be81d1', 'docs_or_tooling'],
  ['b14e96e', 'bugfix'],
  ['9cc3157', 'refactor'],
  ['153fc00', 'bugfix'],
  ['8edb4bc', 'feature'],
  ['c5ee59d', 'feature'],
  ['8ec9808', 'refactor'],
  ['53f0ca5', 'refactor'],
  ['8cbf877', 'refactor'],
  ['d005289', 'refactor'],
  ['0583440', 'refactor'],
  ['0a79394', 'refactor'],
  ['7bb6970', 'refactor'],
  ['c76724b', 'refactor'],
  ['f2d4b41', 'refactor'],
  ['d8fbad5', 'refactor'],
  ['817dd95', 'bugfix'],
]

const KIND_CRITERIA = {
  bugfix: {
    what: 'Corrects behavior that was wrong before the change',
    not_for: 'Restructuring code that already behaved correctly',
  },
  feature: {
    what: 'Adds a capability the program did not have before',
    not_for: 'Repairing a capability that already existed',
  },
  refactor: {
    what: 'Renames, moves, reformats or restructures code without changing what it does',
    not_for: 'Changes that alter what happens at runtime',
  },
  docs_or_tooling: {
    what: 'Changes only documentation, changelog, CI workflows or package metadata',
    not_for: 'Any change to files under src/',
  },
  mixed: { what: 'Two or more of the other kinds with none clearly dominant' },
}

const BLAST_RADIUS_LEVELS = [
  'Touches only docs, comments, formatting or tests',
  'Localized change inside one function or module with an obvious effect',
  'Changes control flow, state or file layout that other modules depend on',
  'Changes concurrency, the order of file system writes or the hook protocol, where a mistake loses or corrupts a turn',
]

const BLIND_QUESTIONS = {
  kind: {
    type: 'choice',
    instructions: {
      question: 'Which kind of change does `diff` make to the program?',
      focus: 'Judge what the code does differently after the change, not how large the change is',
    },
    criteria: KIND_CRITERIA,
  },
  changes_runtime_behavior: {
    type: 'noul',
    instructions: 'Does `diff` change what the program does at runtime?',
    criteria: {
      true: 'Some input now produces a different result, side effect or error than before',
      false: 'Only names, formatting, structure, comments, documentation or tests changed',
    },
  },
  blast_radius: {
    type: 'score',
    instructions: 'How far could a mistake in `diff` reach?',
    criteria: BLAST_RADIUS_LEVELS,
  },
}

const VERIFY_QUESTIONS = {
  matches_a: {
    type: 'noul',
    instructions: 'Does `diff` implement the change that `candidate_messages.a` describes?',
    criteria: {
      true: 'The code change does what the message says',
      false: 'The message describes a different change than the one in `diff`',
    },
  },
  matches_b: {
    type: 'noul',
    instructions: 'Does `diff` implement the change that `candidate_messages.b` describes?',
    criteria: {
      true: 'The code change does what the message says',
      false: 'The message describes a different change than the one in `diff`',
    },
  },
  which_message: {
    type: 'choice',
    instructions: 'Which of `candidate_messages` was written for `diff`?',
    criteria: { a: 'The message under key a', b: 'The message under key b' },
  },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runGit = (...args) => execFileSync('git', args, { cwd: REPO_DIR, encoding: 'utf8', maxBuffer: 1 << 26 })

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readCommit = ([hash, expectedKind]) => {
  const message = runGit('log', '-1', '--format=%s', hash).trim()
  const files = runGit('show', hash, '--format=', '--name-only', '--', '.', ':!package-lock.json').trim().split('\n')
  const diff = runGit('show', hash, '--format=', '--', '.', ':!package-lock.json')

  return { hash, expectedKind, message, files, diff }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildCommitRequests = (commit, position, commits) => {
  const { hash, message, expectedKind, files, diff } = commit
  const swappedMessage = commits[(position + 1) % commits.length].message
  const realSlot = position % 2 === 0 ? 'a' : 'b'
  const messages = [message, swappedMessage]
  const [messageA, messageB] = realSlot === 'a' ? messages : messages.toReversed()
  const verifyState = { candidate_messages: { a: messageA, b: messageB }, files, diff }
  const blind = { name: `${hash}-blind`, body: { state: { files, diff }, model: MODEL, questions: BLIND_QUESTIONS } }
  const verify = { name: `${hash}-verify`, body: { state: verifyState, model: MODEL, questions: VERIFY_QUESTIONS } }

  return { record: { hash, message, expectedKind, realSlot, diffChars: diff.length }, blind, verify }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const buildCommitBatch = (limit) => {
  const commits = COMMITS.slice(0, limit).map(readCommit)

  return commits.map(buildCommitRequests)
}
