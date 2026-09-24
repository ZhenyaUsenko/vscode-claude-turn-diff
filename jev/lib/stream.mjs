import { readFileSync } from 'node:fs'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const parseStream = (streamFile) => {
  const lines = readFileSync(streamFile, 'utf8').split('\n').filter(Boolean)
  const messages = lines.map((line) => JSON.parse(line))
  const init = messages.find((message) => message.type === 'system' && message.subtype === 'init')
  const result = messages.findLast((message) => message.type === 'result')
  const limits = messages.findLast((message) => message.type === 'rate_limit_event')?.rate_limit_info

  return {
    model: init?.model,
    tools: init?.tools,
    fastModeState: result?.fast_mode_state ?? init?.fast_mode_state,
    fastModeDisabledReason: result?.fast_mode_disabled_reason ?? init?.fast_mode_disabled_reason,
    speed: result?.usage?.speed,
    resultSubtype: result?.subtype,
    isError: result?.is_error,
    durationMs: result?.duration_ms,
    durationApiMs: result?.duration_api_ms,
    numTurns: result?.num_turns,
    costUsd: result?.total_cost_usd,
    permissionDenials: result?.permission_denials ?? [],
    fiveHourUtilization: limits?.unifiedWindows?.five_hour?.utilization,
    sevenDayUtilization: limits?.unifiedWindows?.seven_day?.utilization,
  }
}
