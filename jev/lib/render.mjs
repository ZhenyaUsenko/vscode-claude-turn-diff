const LANGUAGE_BY_KEY = { js: 'js', mjs: 'js', sh: 'bash', md: 'md', json: 'json', diff: 'diff', technical_notes: 'md' }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatPercent = (value) => `${Math.round(value * 100)}%`

const formatScalar = (value) => typeof value === 'string' ? value : JSON.stringify(value)

const isObject = (value) => value !== null && typeof value === 'object'

const isMultiline = (value) => typeof value === 'string' && value.includes('\n')

const getLanguage = (key) => LANGUAGE_BY_KEY[key.split('.').pop()] ?? ''

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const fence = (text, language) => {
  const longestRun = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const marker = '`'.repeat(longestRun + 1)

  return `${marker}${language}\n${text}\n${marker}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderItem = (item, indent) => {
  if (isObject(item)) return [`${indent}-`, ...renderLines(item, `${indent}  `)]

  return [`${indent}- ${formatScalar(item)}`]
}

const renderField = (key, child, indent) => {
  if (isObject(child)) return [`${indent}- **${key}**`, ...renderLines(child, `${indent}  `)]

  return [`${indent}- **${key}**: ${formatScalar(child)}`]
}

const renderLines = (value, indent) => {
  if (Array.isArray(value)) return value.flatMap((item) => renderItem(item, indent))
  if (isObject(value)) return Object.entries(value).flatMap(([key, child]) => renderField(key, child, indent))

  return [`${indent}${formatScalar(value)}`]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatDistribution = (probabilities, legend) => {
  const parts = Object.entries(probabilities).map(([key, probability]) => {
    const label = legend ? `${key} "${legend[key]}"` : key

    return `${label} ${formatPercent(probability)}`
  })

  return parts.join(', ')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatAnswer = (answer) => {
  if (answer.type === 'noul') return `noul ${formatPercent(answer.noul)}`

  const confidence = `confidence ${answer.confidence.toFixed(2)}`

  if (answer.type === 'choice') {
    return `choice **${answer.choice}**, ${confidence}, ${formatDistribution(answer.probabilities)}`
  }

  const levels = formatDistribution(answer.probabilities, answer.legend)

  return `score **${answer.score.toFixed(2)}**, ${confidence}, ${levels}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderHeader = (entry) => {
  const rows = [
    ['at', entry.at],
    ['request', `${entry.method} ${entry.path}`],
    ['status', String(entry.status)],
    ['elapsed', `${entry.elapsedMs} ms`],
    ['sequence', String(entry.sequence)],
  ]

  if (entry.response.usage) {
    const { input_tokens, output_tokens } = entry.response.usage

    const usage = `${input_tokens} input tokens, ${output_tokens} output tokens`

    rows.push(['model', entry.response.model], ['usage', usage])
  }

  const table = rows.map(([field, value]) => `| ${field} | ${value} |`)

  return [`# ${entry.name}`, '', '| field | value |', '| --- | --- |', ...table, '']
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderAnswerTable = (answers) => {
  const rows = Object.entries(answers).map(([id, answer]) => `| ${id} | ${formatAnswer(answer)} |`)

  return ['## Answers', '', '| question | answer |', '| --- | --- |', ...rows, '']
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderResponse = (response) => ['## Response', '', fence(JSON.stringify(response, null, 2), 'json'), '']

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderQuestion = (id, question, answer) => {
  const heading = answer ? `### ${id}: ${formatAnswer(answer)}` : `### ${id} (${question.type})`
  const fields = Object.fromEntries(Object.entries(question).filter(([key]) => key !== 'type'))

  return [heading, '', ...renderLines(fields, ''), '']
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderQuestions = (questions, answers) => {
  const sections = Object.entries(questions).flatMap(([id, question]) => renderQuestion(id, question, answers?.[id]))

  return ['## Questions', '', ...sections]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderSection = (key, value, level) => {
  const heading = `${'#'.repeat(level)} ${key}`

  if (isMultiline(value)) return [heading, '', fence(value, getLanguage(key)), '']

  if (isObject(value) && !Array.isArray(value) && Object.values(value).every(isMultiline)) {
    const children = Object.entries(value).flatMap(([childKey, child]) => renderSection(childKey, child, level + 1))

    return [heading, '', ...children]
  }

  return [heading, '', ...renderLines(value, ''), '']
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const renderState = (state) => {
  if (!isObject(state)) return ['## State', '', fence(String(state), ''), '']
  if (Array.isArray(state)) return ['## State', '', fence(JSON.stringify(state, null, 2), 'json'), '']

  return ['## State', '', ...Object.entries(state).flatMap(([key, value]) => renderSection(key, value, 3))]
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const renderLog = (entry) => {
  const lines = renderHeader(entry)

  if (entry.response.answers) {
    lines.push(...renderAnswerTable(entry.response.answers))
  } else {
    lines.push(...renderResponse(entry.response))
  }

  if (entry.request) {
    lines.push(...renderQuestions(entry.request.questions, entry.response.answers))
    lines.push(...renderState(entry.request.state))
  }

  return `${lines.join('\n')}\n`
}
