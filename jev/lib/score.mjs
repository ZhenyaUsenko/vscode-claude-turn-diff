import { REPO_DIR } from './paths.mjs'

const VERDICT_LINE = /^[\s>*-]*`?(pass|fail)`?\s+`?([a-z][a-z0-9_]*\.[a-z0-9_]+)`?\s*(?::\s*(.*))?$/i

const RAN_LINE = /^[\s>*-]*ran:\s*(.*)$/i

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
  'scenario-tests.md',
  'jev/typesafe',
  'git log',
  'git show',
]

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const parseVerdicts = (finalText) => {
  const verdicts = {}
  const ranIds = []

  for (const line of finalText.split('\n')) {
    const verdictMatch = line.trim().match(VERDICT_LINE)
    const ranMatch = line.trim().match(RAN_LINE)

    if (verdictMatch) verdicts[verdictMatch[2]] = { verdict: verdictMatch[1].toLowerCase(), why: verdictMatch[3] }
    if (ranMatch) ranIds.push(...ranMatch[1].split(/[\s,]+/).filter((id) => id.includes('.')))
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

const isAllowedClosedCall = (run, { name, summary }) => {
  if (name === 'Read') return summary.startsWith(run.promptFile)
  if (name !== 'Bash') return false

  const readsPromptFile = /^(cat|head|tail|sed -n '[^']*') /.test(summary) && summary.endsWith(run.promptFile)

  return summary.includes('build-prompt.mjs') || readsPromptFile
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const findOpenViolation = (run, { summary }) => {
  const otherRun = summary.match(/jev\/runs\/(r\d+)/g)?.find((match) => !match.endsWith(`/${run.id}`))
  const marker = OPEN_FORBIDDEN_MARKERS.find((candidate) => summary.includes(candidate))

  return otherRun ?? marker
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const checkCompliance = (run, toolCalls) => {
  if (run.approach === 'closed') {
    const violations = toolCalls.filter((call) => !isAllowedClosedCall(run, call))

    return violations.map((call) => `${call.name}: ${call.summary}`)
  }

  const markedCalls = toolCalls.map((call) => ({ call, marker: findOpenViolation(run, call) }))
  const flagged = markedCalls.filter(({ marker }) => marker)

  return flagged.map(({ call, marker }) => `${marker} in ${call.name}: ${call.summary}`)
}
