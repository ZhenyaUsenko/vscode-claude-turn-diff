import { REPO_DIR } from './paths.mjs'

const VERDICT_LINE = /^[\s>*-]*`?(pass|fail)`?\s+(.*)$/i

const RAN_LINE = /^[\s>*-]*ran:\s*(.*)$/i

const LEADING_MARKS = /^[`\s]+/

const REASON_START = /^[`\s]*:?\s*/

const OPEN_FORBIDDEN_MARKERS = [
  `${REPO_DIR}/src`,
  `${REPO_DIR}/test`,
  `${REPO_DIR}/hooks`,
  'test/cases',
  'test/utils',
  'TECHNICAL.md',
  'npm test',
  'npm run',
  'jev/logs',
  'jev/runs/real',
  'bugs.mjs',
  'wording-notes',
  'context-notes-log',
  'jev/typesafe',
  'git log',
  'git show',
]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findTestId = (text, testIds) => {
  const matches = testIds.filter((id) => text.startsWith(id))

  return matches.sort((a, b) => b.length - a.length)[0]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const parseVerdictLine = ([, verdict, rest], testIds) => {
  const text = rest.replace(LEADING_MARKS, '')
  const id = findTestId(text, testIds)
  const why = id && text.slice(id.length).replace(REASON_START, '')

  return id && [id, { verdict: verdict.toLowerCase(), why: why || undefined }]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const parseVerdicts = (finalText, testIds) => {
  const verdicts = {}
  const ranIds = []

  for (const line of finalText.split('\n')) {
    const verdictMatch = line.trim().match(VERDICT_LINE)
    const ranMatch = line.trim().match(RAN_LINE)
    const parsed = verdictMatch && parseVerdictLine(verdictMatch, testIds)

    if (parsed) verdicts[parsed[0]] = parsed[1]
    if (ranMatch) ranIds.push(...testIds.filter((id) => ranMatch[1].includes(id)))
  }

  return { verdicts, ranIds }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const scoreRun = (testIds, verdicts, real) => {
  const agentFails = testIds.filter((id) => verdicts[id]?.verdict === 'fail')
  const realFails = real.loadFailed ? testIds : testIds.filter((id) => real.results[id] === 'fail')
  const caught = agentFails.filter((id) => realFails.includes(id))
  const extra = agentFails.filter((id) => !realFails.includes(id))
  const missed = realFails.filter((id) => !agentFails.includes(id))
  const unanswered = testIds.filter((id) => !verdicts[id])

  const detected = realFails.length ? caught.length > 0 : null

  return { agentFails, realFails, caught, extra, missed, unanswered, detected }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findOpenViolation = (run, { summary }) => {
  const otherRun = summary.match(/jev\/runs\/(r\d+)/g)?.find((match) => !match.endsWith(`/${run.id}`))
  const marker = OPEN_FORBIDDEN_MARKERS.find((candidate) => summary.includes(candidate))

  return otherRun ?? marker
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const checkCompliance = (run, toolCalls) => {
  if (run.approach === 'closed') return toolCalls.map((call) => `${call.name}: ${call.summary}`)

  const markedCalls = toolCalls.map((call) => ({ call, marker: findOpenViolation(run, call) }))
  const flagged = markedCalls.filter(({ marker }) => marker)

  return flagged.map(({ call, marker }) => `${marker} in ${call.name}: ${call.summary}`)
}
