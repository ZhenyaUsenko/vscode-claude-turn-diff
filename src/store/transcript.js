import { readFileTail } from '../utils/files.js'
import { getTranscriptFile } from './paths.js'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const TAIL_BYTES = 64 * 1024

const INTERRUPT_MARKER = '[Request interrupted by user'

const SPOKEN_TYPES = ['user', 'assistant']

const TERMINAL_STOP_REASONS = ['end_turn', 'stop_sequence', 'max_tokens', 'refusal']

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getEntryText = (entry) => {
  const content = entry.message?.content

  if (typeof content === 'string') return content

  return content?.map((block) => block.text ?? '').join('') ?? ''
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const isEndOfTurn = (entry) => {
  if (entry.type === 'assistant') return TERMINAL_STOP_REASONS.includes(entry.message?.stop_reason)

  return getEntryText(entry).trim().startsWith(INTERRUPT_MARKER)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const isTurnOver = (project, sessionId) => {
  const lines = readFileTail(getTranscriptFile(project, sessionId), TAIL_BYTES)?.split('\n') ?? []

  for (let index = lines.length - 1; index >= 0; index--) {
    let entry

    try { entry = JSON.parse(lines[index]) } catch { continue }

    if (entry.isSidechain || !SPOKEN_TYPES.includes(entry.type)) continue

    return isEndOfTurn(entry)
  }

  return false
}
