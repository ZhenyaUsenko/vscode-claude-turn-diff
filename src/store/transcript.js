import { readFileTail } from '../utils/files.js'
import { getTranscriptFile } from './paths.js'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const TAIL_BYTES = 64 * 1024

const INTERRUPT_MARKER = '[Request interrupted by user'

const SPOKEN_TYPES = ['user', 'assistant']

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getEntryText = (entry) => {
  const content = entry.message?.content

  if (typeof content === 'string') return content

  return content?.map((block) => block.text ?? '').join('') ?? ''
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const isTurnInterrupted = (project, sessionId) => {
  const lines = readFileTail(getTranscriptFile(project, sessionId), TAIL_BYTES)?.split('\n') ?? []

  for (let index = lines.length - 1; index >= 0; index--) {
    let entry

    try { entry = JSON.parse(lines[index]) } catch { continue }

    if (entry.isSidechain || !SPOKEN_TYPES.includes(entry.type)) continue

    return entry.type === 'user' && getEntryText(entry).trim().startsWith(INTERRUPT_MARKER)
  }

  return false
}
