import { choice, noul, score } from '../lib/questions.mjs'

const ACCURACY_LEVELS = [
  'The program does something different from what the statement says',
  'The statement is broadly right but claims more than the program guarantees, or leaves out a condition',
  'The statement is exactly right',
]

const WEAKEST_CLAIM_CRITERIA = {
  baseline_not_consumed: 'That looking at a running turn does not consume its baseline',
  stays_armed: 'That the turn stays armed after the look',
  rest_still_captured: 'That the rest of the turn is still captured after the look',
  end_publishes_everything: 'That the turn\'s own end publishes everything the turn changed',
  none: 'Every part is supported',
}

const ARMED_FILES_CRITERIA = {
  removes_them: 'It removes them, as ending a turn does',
  leaves_them: 'It leaves them in place',
  depends_on_transcript: 'It removes them only when the transcript says the turn is over',
}

const ACCURACY_QUESTION = 'How accurately does `statement` describe what the program in `files` does?'

const WEAKEST_CLAIM_QUESTION = 'Which part of `statement` is least supported by the program in `files`?'

const ARMED_FILES_QUESTION = (
  'In `files`, what does asking for the diff while a turn is still running do to the armed-turn files ' +
  '(sessionId.txt, promptId.txt, snapshots.tsv, touchList.txt, touchCopies)?'
)

const LOOK_KEEPS_SNAPSHOTS_QUESTION = (
  'In `files`, when publishArmedTurn runs while the transcript shows the turn is still running, does ' +
  'snapshots.tsv still exist afterwards?'
)

const ENDED_FALSE_REMOVES_QUESTION = (
  'In `files`, does endTurn called with ended false remove the armed-turn files?'
)

const ENDED_FALSE_PUBLISHES_QUESTION = (
  'In `files`, does endTurn called with ended false write before-images and publish a manifest when the turn ' +
  'has changed something?'
)

const LOOK_RUNNING_TRUE_QUESTION = (
  'In `files`, does a look at a running turn publish a manifest whose running field is true?'
)

const END_AFTER_LOOK_QUESTION = (
  'In `files`, after a look at a running turn, does the turn\'s own end publish a manifest that lists a file ' +
  'changed before the look as well as a file changed after it?'
)

const TRANSCRIPT_DECIDES_QUESTION = (
  'In `files`, is isTurnOver on the transcript what decides whether publishArmedTurn tears the turn down?'
)

export const probe = {
  test: 'running.a_look_leaves_the_turn_armed',
  questions: {
    original_via_state: noul('Does the program in `files` behave as `statement` describes?'),
    accuracy: score(ACCURACY_QUESTION, ACCURACY_LEVELS),
    weakest_claim: choice(WEAKEST_CLAIM_QUESTION, WEAKEST_CLAIM_CRITERIA),
    armed_files_after_look: choice(ARMED_FILES_QUESTION, ARMED_FILES_CRITERIA),
    look_keeps_snapshots: noul(LOOK_KEEPS_SNAPSHOTS_QUESTION),
    ended_false_removes_armed: noul(ENDED_FALSE_REMOVES_QUESTION),
    ended_false_publishes: noul(ENDED_FALSE_PUBLISHES_QUESTION),
    look_publishes_running_true: noul(LOOK_RUNNING_TRUE_QUESTION),
    end_after_look_lists_both: noul(END_AFTER_LOOK_QUESTION),
    transcript_decides_teardown: noul(TRANSCRIPT_DECIDES_QUESTION),
  },
}
