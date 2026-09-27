import { fence } from './render.mjs'

const APPROACH_LABELS = {
  closed: 'closed: the prompt holds the notes, source and tests, and there are no tools',
  open: 'open: may use any tool, under rules',
  suite: 'suite: writes and runs a test suite in a prepared workspace',
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatDuration = (durationMs) => `${Math.floor(durationMs / 60000)}m ${Math.round(durationMs / 1000) % 60}s`

const formatCount = (value) => value.toLocaleString('en-US')

const escapeCell = (text) => (text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')

const formatIds = (ids) => ids.length ? ids.map((id) => `\`${id}\``).join(', ') : '-'

const formatToolCall = (call, index) => `${index + 1}. **${call.name}**: \`${escapeCell(call.summary).slice(0, 300)}\``

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatSpeed = (cli) => {
  if (!cli) return 'standard'

  const reason = cli.fastModeDisabledReason ? ` (${cli.fastModeDisabledReason})` : ''

  return `${cli.speed}, fast mode ${cli.fastModeState}${reason}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatCli = (cli) => {
  if (!cli) return '-'

  const usage = `5h window ${cli.fiveHourUtilization}, ${cli.permissionDenials.length} permission denials`

  const cost = cli.costUsd == null ? 'no cost reported' : `$${cli.costUsd.toFixed(2)} reported`

  return `${cost}, ${cli.numTurns} turns, ${usage}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderHeader = (record) => {
  const { transcript, harness } = record
  const { input, cacheCreation, cacheRead, output } = transcript.tokens
  const toolCounts = Object.entries(Object.groupBy(transcript.toolCalls, (call) => call.name))
  const toolSummary = toolCounts.map(([name, calls]) => `${name} ${calls.length}`).join(', ') || 'none'
  const inputSummary = `${formatCount(input + cacheCreation + cacheRead)} (${formatCount(cacheRead)} read from cache)`
  const rows = [
    ['run', record.id],
    ['batch', record.batch ?? `subagent-${record.approach}`],
    ['tests', record.group ? `group ${record.group}` : 'all groups'],
    ['approach', APPROACH_LABELS[record.approach]],
    ['instructions', record.cliLaunch?.agent ?? `text-tests-${record.approach}`],
    ['effort', (transcript.efforts ?? []).join(', ') || 'unknown'],
    ['speed', formatSpeed(record.cli)],
    ['bug', `${record.bug}: ${record.summary}`],
    ['model', transcript.models.join(', ')],
    ['duration', formatDuration(transcript.durationMs)],
    ['API requests', String(transcript.requestCount)],
    ['input tokens processed', inputSummary],
    ['output tokens', formatCount(output)],
    ['final context', `${formatCount(transcript.contextSize)} tokens`],
    ['tool calls', `${transcript.toolCalls.length}: ${toolSummary}`],
    ['harness report', JSON.stringify(harness)],
    ['CLI report', formatCli(record.cli)],
    ['rule flags', record.compliance.length ? String(record.compliance.length) : 'none'],
    ['prompt file', record.promptFile],
  ]

  return [`# ${record.id} ${record.approach}: ${record.bug}`, '', '| field | value |', '| --- | --- |']
    .concat(rows.map(([field, value]) => `| ${field} | ${escapeCell(value)} |`))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderScore = ({ score, real, ranIds }) => {
  const realLabel = real.crashed ? 'real suite (crashed at load)' : 'real suite fails'
  const rows = [
    [realLabel, score.realFails],
    ['agent fails', score.agentFails],
    ['caught by both', score.caught],
    ['agent only', score.extra],
    ['missed by agent', score.missed],
    ['unanswered', score.unanswered],
    ['checked by running code', ranIds],
  ]

  return ['', '## Score', '', '| | count | tests |', '| --- | --- | --- |']
    .concat(rows.map(([label, ids]) => `| ${label} | ${ids.length} | ${formatIds(ids)} |`))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderVerdicts = ({ testIds, verdicts, real }) => {
  const rows = testIds.map((id) => {
    const agentVerdict = verdicts[id]?.verdict ?? 'missing'
    const realVerdict = real.results[id]
    const mark = agentVerdict === realVerdict ? '' : '!'

    return `| ${mark} | \`${id}\` | ${agentVerdict} | ${realVerdict} | ${escapeCell(verdicts[id]?.why)} |`
  })

  return ['', '## Verdicts', '', '| | test | agent | real | why |', '| --- | --- | --- | --- | --- |', ...rows]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderToolCalls = ({ transcript, compliance }) => {
  const calls = transcript.toolCalls.map(formatToolCall)
  const lines = ['', '## Tool calls', '', ...calls]

  if (compliance.length) lines.push('', '### Rule flags', '', ...compliance.map((flag) => `- ${escapeCell(flag)}`))

  return lines
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const renderRun = (record) => {
  const lines = [
    ...renderHeader(record),
    ...renderScore(record),
    ...renderVerdicts(record),
    ...renderToolCalls(record),
    '',
    '## Message sent',
    '',
    fence(record.message, 'text'),
    '',
    '## Final message',
    '',
    fence(record.transcript.finalText, 'text'),
  ]

  return `${lines.join('\n')}\n`
}
