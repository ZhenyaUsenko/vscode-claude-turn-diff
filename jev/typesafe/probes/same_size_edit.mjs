import { choice, noul, score } from '../lib/questions.mjs'

const ACCURACY_LEVELS = [
  'The program does something different from what the statement says',
  'The statement is broadly right but claims more than the program guarantees, or leaves out a condition',
  'The statement is exactly right',
]

const WEAKEST_CLAIM_CRITERIA = {
  same_size_edit_detected: 'That an edit leaving a file the same size is detected at all',
  same_second_as_commit: 'That it is detected when made in the same second the file was last committed',
  end_a_second_later: 'That it is detected when the turn ends a second or more later',
  stat_cache_not_allowed: 'That git\'s stat cache is not allowed to hide it',
  none: 'Every part is supported',
}

const ACCURACY_QUESTION = 'How accurately does `statement` describe what the program in `files` does?'

const WEAKEST_CLAIM_QUESTION = 'Which part of `statement` is least supported by the program in `files`?'

const COPY_KEEPS_MTIME_QUESTION = (
  'In `files`, does snapshotTree give its copy of .git/index the same mtime as the original index?'
)

const RACY_RULE_QUESTION = (
  'Given `context.git`, does git re-read a file whose index entry has the same size and mtime as the file when ' +
  'the entry\'s mtime is not older than the index file\'s own mtime?'
)

const FRESH_COPY_HIDES_QUESTION = (
  'If the index copy had a fresh mtime instead, would git skip re-reading a file edited to the same size in the ' +
  'same second as the last commit, so the edit went unreported?'
)

const EDIT_LISTED_QUESTION = (
  'Does the program in `files` list in the diff an edit that left a file the same size, made in the same second ' +
  'as the last commit, when the turn ends a second or more later?'
)

const EDIT_LISTED_PLAIN_QUESTION = (
  'Does the program in `files` list in the diff an edit that changed a file\'s contents but left its size the same?'
)

const STAT_CACHE_PHRASE_QUESTION = (
  'Is "Git\'s stat cache is not allowed to hide it" in `statement` something the program in `files` does?'
)

export const probe = {
  test: 'Capture: A same-size edit is seen a second later',
  questions: {
    original_via_state: noul('Does the program in `files` behave as `statement` describes?'),
    accuracy: score(ACCURACY_QUESTION, ACCURACY_LEVELS),
    weakest_claim: choice(WEAKEST_CLAIM_QUESTION, WEAKEST_CLAIM_CRITERIA),
    copy_keeps_mtime: noul(COPY_KEEPS_MTIME_QUESTION),
    racy_rule_known: noul(RACY_RULE_QUESTION),
    fresh_copy_would_hide: noul(FRESH_COPY_HIDES_QUESTION),
    edit_listed_full_case: noul(EDIT_LISTED_QUESTION),
    edit_listed_plain: noul(EDIT_LISTED_PLAIN_QUESTION),
    stat_cache_phrase: noul(STAT_CACHE_PHRASE_QUESTION),
  },
}
