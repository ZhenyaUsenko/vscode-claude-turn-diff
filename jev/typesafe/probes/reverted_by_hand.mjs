import { choice, noul, score } from '../lib/questions.mjs'

const ACCURACY_LEVELS = [
  'The program does something different from what the statement says',
  'The statement is broadly right but claims more than the program guarantees, or leaves out a condition',
  'The statement is exactly right',
]

const WEAKEST_CLAIM_CRITERIA = {
  reverted_file_dropped: 'That a file reverted by hand after the turn drops out of the diff',
  decided_when_opened: 'That this happens when the diff is opened',
  other_changes_remain: 'That the other changes remain',
  none: 'Every part is supported',
}

const ACCURACY_QUESTION = 'How accurately does `statement` describe what the program in `files` does?'

const WEAKEST_CLAIM_QUESTION = 'Which part of `statement` is least supported by the program in `files`?'

const SKIP_SAME_CONTENTS_QUESTION = (
  'In `files`, does getResources in src/view.js leave out a change whose file holds exactly the bytes its ' +
  'before-image holds?'
)

const SAME_CONTENTS_TRUE_QUESTION = (
  'In `files`, does sameContents in src/utils/files.js return true for two existing files with identical contents?'
)

const DECIDED_AT_OPEN_QUESTION = (
  'In `files`, is the decision to leave out a reverted file made when the diff is opened, from the files as ' +
  'they are then, rather than when the turn ended?'
)

const OTHERS_LISTED_QUESTION = (
  'In `files`, when one of two changed files has been reverted by hand, does the opened diff still list the ' +
  'other file?'
)

const MANIFEST_UNCHANGED_QUESTION = (
  'In `files`, does reverting a file by hand after the turn leave the manifest on disk as it was?'
)

export const probe = {
  test: 'View: A file reverted by hand drops out',
  questions: {
    original_via_state: noul('Does the program in `files` behave as `statement` describes?'),
    accuracy: score(ACCURACY_QUESTION, ACCURACY_LEVELS),
    weakest_claim: choice(WEAKEST_CLAIM_QUESTION, WEAKEST_CLAIM_CRITERIA),
    skip_same_contents: noul(SKIP_SAME_CONTENTS_QUESTION),
    same_contents_true: noul(SAME_CONTENTS_TRUE_QUESTION),
    decided_at_open: noul(DECIDED_AT_OPEN_QUESTION),
    others_listed: noul(OTHERS_LISTED_QUESTION),
    manifest_unchanged: noul(MANIFEST_UNCHANGED_QUESTION),
  },
}
