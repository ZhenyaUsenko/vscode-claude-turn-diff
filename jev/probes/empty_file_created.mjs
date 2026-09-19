import { choice, noul, score } from '../lib/questions.mjs'

const ACCURACY_LEVELS = [
  'The program does something different from what the statement says',
  'The statement is broadly right but claims more than the program guarantees, or leaves out a condition',
  'The statement is exactly right',
]

const WEAKEST_CLAIM_CRITERIA = {
  created_empty_file_listed: 'That a file the turn created with empty contents is listed in the diff',
  no_before_image_written: 'That no before-image is written for it',
  none: 'Every part is supported',
}

const ACCURACY_QUESTION = 'How accurately does `statement` describe what the program in `files` does?'

const WEAKEST_CLAIM_QUESTION = 'Which part of `statement` is least supported by the program in `files`?'

const CREATED_LISTED_QUESTION = (
  'Does the program in `files` list in the diff a file inside a git repository that the turn created with ' +
  'empty contents?'
)

const NO_IMAGE_QUESTION = (
  'For a file inside a git repository that the turn created with empty contents, does the program in `files` ' +
  'write no before-image at all?'
)

const EMPTY_IMAGE_QUESTION = (
  'For a file inside a git repository that the turn created with empty contents, does the program in `files` ' +
  'write an empty before-image file?'
)

const MISSING_BLOB_QUESTION = (
  'In `files`, does readBlobContents in src/utils/git.js return null for a path that is absent from the tree?'
)

const ADD_CHANGE_QUESTION = (
  'In `files`, when addChange in src/turn/collect.js is called with beforeContents null and afterContents an ' +
  'empty Buffer, does it push a change and no image?'
)

const IMAGE_CONDITION_QUESTION = (
  'In `files`, does addChange in src/turn/collect.js push an image only when beforeContents is not null ' +
  'and not undefined?'
)

export const probe = {
  test: 'capture.empty_file_created',
  questions: {
    original_via_state: noul('Does the program in `files` behave as `statement` describes?'),
    accuracy: score(ACCURACY_QUESTION, ACCURACY_LEVELS),
    weakest_claim: choice(WEAKEST_CLAIM_QUESTION, WEAKEST_CLAIM_CRITERIA),
    created_listed: noul(CREATED_LISTED_QUESTION),
    no_image_written: noul(NO_IMAGE_QUESTION),
    empty_image_written: noul(EMPTY_IMAGE_QUESTION),
    missing_blob_is_null: noul(MISSING_BLOB_QUESTION),
    add_change_null_before: noul(ADD_CHANGE_QUESTION),
    image_only_when_not_null: noul(IMAGE_CONDITION_QUESTION),
  },
}
