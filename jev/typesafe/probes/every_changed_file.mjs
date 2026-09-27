import { choice, noul, score } from '../lib/questions.mjs'

const OVERCLAIM_CRITERIA = {
  true: 'Some case the statement covers is not handled the way the statement says',
  false: 'The statement claims only what the program does',
}

const WEAKEST_CLAIM_CRITERIA = {
  modified_files_listed: 'That every modified file is listed in the diff',
  created_files_listed: 'That every created file is listed in the diff',
  deleted_files_listed: 'That every deleted file is listed in the diff',
  before_image_contents: 'That a before-image holds exactly what the file held before the turn',
  created_has_no_before_image: 'That a created file has no before-image',
  every_file_scope: 'That "every file" holds for files anywhere, including outside every git repository',
  none: 'Every part is supported',
}

const LISTED_SCOPE_CRITERIA = {
  every_file_anywhere: 'Every file the turn changed, wherever it is',
  repository_files_only: 'Only files inside a git repository in the workspace',
  repository_files_and_named_outside_files: (
    'Files inside a git repository, plus files outside every repository that a tool named before writing'
  ),
  named_files_only: 'Only files a tool named before writing',
}

const MAIN_GAP_CRITERIA = {
  outside_files: 'Files outside every git repository are listed only when a tool named them first',
  binary_files: 'Binary files are left out of the diff',
  large_untracked_files: 'Untracked files over a size limit are left out of the diff',
  unchanged_rewrites: 'A file rewritten with the same contents it had before is not listed',
  before_images: 'Before-images do not hold exactly what the file held before the turn',
  exactly_right: 'The statement is exactly right',
}

const ACCURACY_LEVELS = [
  'The program does something different from what the statement says',
  'The statement is broadly right but claims more than the program guarantees, or leaves out a condition',
  'The statement is exactly right',
]

const ACCURACY_QUESTION = 'How accurately does `statement` describe what the program in `files` does?'

const WEAKEST_CLAIM_QUESTION = 'Which part of `statement` is least supported by the program in `files`?'

const LISTED_SCOPE_QUESTION = 'Which changed files does the program in `files` list in a turn\'s diff?'

const MAIN_GAP_QUESTION = 'What is the main reason `statement` is not exactly what the program in `files` does?'

const MODIFIED_BEFORE_IMAGE_QUESTION = (
  'For a modified file inside a git repository, does the program in `files` keep a before-image holding ' +
  'exactly what the file held before the turn?'
)

const DELETED_BEFORE_IMAGE_QUESTION = (
  'For a deleted file inside a git repository, does the program in `files` keep a before-image holding ' +
  'exactly what the file held before the turn?'
)

const OUTSIDE_SHELL_WRITE_QUESTION = (
  'Is a file outside every git repository, changed by a shell command without any tool naming it, ' +
  'listed in the diff by the program in `files`?'
)

const OUTSIDE_NAMED_QUESTION = (
  'Is a file outside every git repository, named by an Edit or Write tool before the turn changed it, ' +
  'listed in the diff by the program in `files`?'
)

const STATEMENT_COVERS_OUTSIDE_QUESTION = (
  'Does the phrase "every file a turn changed" in `statement` include files outside every git repository?'
)

const MODIFIED_TEXT_UNDER_CAP_QUESTION = (
  'Does the program in `files` list every text file under one megabyte inside a git repository ' +
  'that a turn modified?'
)

const BINARY_LISTED_QUESTION = (
  'Is a binary file inside a git repository that a turn modified listed in the diff by the program in `files`?'
)

const LARGE_UNTRACKED_LISTED_QUESTION = (
  'Is an untracked file larger than one megabyte inside a git repository that a turn rewrote ' +
  'listed in the diff by the program in `files`?'
)

const UNCHANGED_REWRITE_LISTED_QUESTION = (
  'Is a file that a turn rewrote with exactly the contents it had before listed in the diff ' +
  'by the program in `files`?'
)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const probe = {
  test: 'Capture: Every changed file is listed',
  questions: {
    original_via_state: noul('Does the program in `files` behave as `statement` describes?'),
    accuracy: score(ACCURACY_QUESTION, ACCURACY_LEVELS),
    overclaims: noul('Does `statement` claim more than the program in `files` guarantees?', OVERCLAIM_CRITERIA),
    weakest_claim: choice(WEAKEST_CLAIM_QUESTION, WEAKEST_CLAIM_CRITERIA),
    main_gap: choice(MAIN_GAP_QUESTION, MAIN_GAP_CRITERIA),
    listed_scope: choice(LISTED_SCOPE_QUESTION, LISTED_SCOPE_CRITERIA),
    modified_listed: noul('Does the program in `files` list every file inside a git repository that a turn modified?'),
    created_listed: noul('Does the program in `files` list every file inside a git repository that a turn created?'),
    deleted_listed: noul('Does the program in `files` list every file inside a git repository that a turn deleted?'),
    modified_text_under_cap_listed: noul(MODIFIED_TEXT_UNDER_CAP_QUESTION),
    binary_listed: noul(BINARY_LISTED_QUESTION),
    large_untracked_listed: noul(LARGE_UNTRACKED_LISTED_QUESTION),
    unchanged_rewrite_listed: noul(UNCHANGED_REWRITE_LISTED_QUESTION),
    modified_before_image: noul(MODIFIED_BEFORE_IMAGE_QUESTION),
    deleted_before_image: noul(DELETED_BEFORE_IMAGE_QUESTION),
    created_no_before_image: noul('For a file the turn created, does the program in `files` write no before-image?'),
    outside_shell_write_listed: noul(OUTSIDE_SHELL_WRITE_QUESTION),
    outside_named_listed: noul(OUTSIDE_NAMED_QUESTION),
    statement_covers_outside: noul(STATEMENT_COVERS_OUTSIDE_QUESTION),
  },
}
