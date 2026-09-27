import { choice, noul, score } from '../lib/questions.mjs'

const ACCURACY_LEVELS = [
  'The program does something different from what the statement says',
  'The statement is broadly right but claims more than the program guarantees, or leaves out a condition',
  'The statement is exactly right',
]

const WEAKEST_CLAIM_CRITERIA = {
  deleted_empty_file_listed: 'That a file the turn deleted, which was empty before the turn, is listed in the diff',
  before_image_written: 'That a before-image is written for that deleted file at all',
  before_image_is_zero_bytes: 'That the before-image written for it is zero bytes long',
  none: 'Every part is supported',
}

const ACCURACY_QUESTION = 'How accurately does `statement` describe what the program in `files` does?'

const WEAKEST_CLAIM_QUESTION = 'Which part of `statement` is least supported by the program in `files`?'

const DELETED_LISTED_QUESTION = (
  'Does the program in `files` list in the diff a file inside a git repository that a turn deleted?'
)

const DELETED_EMPTY_LISTED_QUESTION = (
  'Does the program in `files` list in the diff a file inside a git repository that was empty before the turn ' +
  'and that the turn deleted?'
)

const DELETED_IMAGE_QUESTION = (
  'For a file inside a git repository that a turn deleted, does the program in `files` write a before-image ' +
  'holding what the file held before the turn?'
)

const DELETED_EMPTY_IMAGE_QUESTION = (
  'For a file inside a git repository that was empty before the turn and that the turn deleted, does the ' +
  'program in `files` write a zero-byte before-image?'
)

const ADD_CHANGE_EMPTY_QUESTION = (
  'In `files`, when addChange in src/turn/collect.js is called with beforeContents being an empty Buffer and ' +
  'afterContents being undefined, does it push a change and an image?'
)

const EMPTY_BUFFER_SKIPPED_QUESTION = (
  'In `files`, does addChange in src/turn/collect.js skip a change whose beforeContents is an empty Buffer?'
)

const CAT_FILE_EMPTY_QUESTION = (
  'In `files`, does readBlobContents in src/utils/git.js return an empty Buffer, rather than null, for a blob ' +
  'whose size is 0?'
)

const RENDER_DELETED_QUESTION = (
  'In `files`, does getResources in src/view.js include a change whose afterFile no longer exists and whose ' +
  'before-image is a zero-byte file?'
)

export const probe = {
  test: 'Capture: A deleted empty file keeps an empty before-image',
  questions: {
    original_via_state: noul('Does the program in `files` behave as `statement` describes?'),
    accuracy: score(ACCURACY_QUESTION, ACCURACY_LEVELS),
    weakest_claim: choice(WEAKEST_CLAIM_QUESTION, WEAKEST_CLAIM_CRITERIA),
    deleted_listed: noul(DELETED_LISTED_QUESTION),
    deleted_empty_listed: noul(DELETED_EMPTY_LISTED_QUESTION),
    deleted_image_written: noul(DELETED_IMAGE_QUESTION),
    deleted_empty_image_written: noul(DELETED_EMPTY_IMAGE_QUESTION),
    add_change_empty_before: noul(ADD_CHANGE_EMPTY_QUESTION),
    empty_buffer_skipped: noul(EMPTY_BUFFER_SKIPPED_QUESTION),
    cat_file_empty_blob: noul(CAT_FILE_EMPTY_QUESTION),
    render_deleted_zero_byte: noul(RENDER_DELETED_QUESTION),
  },
}
