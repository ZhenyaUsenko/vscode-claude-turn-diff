import { LOGS_DIR } from './paths.mjs'
import { renderLog } from './render.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = 'https://api.typesafe.ai/v1'

let requestCounter = 0

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const pad2 = (value) => String(value).padStart(2, '0')

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatStamp = (date) => {
  const day = `${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
  const time = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`

  return `${day}-${time}`
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getApiKey = () => {
  const apiKey = process.env.TYPESAFE_API_KEY

  if (!apiKey) throw new Error('TYPESAFE_API_KEY is not set')

  return apiKey
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const writeLog = (entry) => {
  const stamp = formatStamp(new Date(entry.at))
  const sequence = String(entry.sequence).padStart(3, '0')
  const logFile = join(LOGS_DIR, `${stamp}-${sequence}-${entry.name}`)

  mkdirSync(LOGS_DIR, { recursive: true })
  writeFileSync(`${logFile}.json`, JSON.stringify(entry, null, 2))
  writeFileSync(`${logFile}.md`, renderLog(entry))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const sendRequest = async (path, body, name) => {
  const sequence = requestCounter++
  const at = new Date().toISOString()
  const method = body ? 'POST' : 'GET'
  const headers = { Authorization: `Bearer ${getApiKey()}`, 'Content-Type': 'application/json' }
  const startedAt = performance.now()
  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body: body && JSON.stringify(body) })
  const elapsedMs = Math.round(performance.now() - startedAt)
  const responseBody = await response.json()
  const status = response.status

  if (name) writeLog({ sequence, at, name, method, path, status, elapsedMs, request: body, response: responseBody })

  if (!response.ok) throw new Error(`${path}: HTTP ${status} ${JSON.stringify(responseBody)}`)

  return { ...responseBody, elapsedMs }
}
