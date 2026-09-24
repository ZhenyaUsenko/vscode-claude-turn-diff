import { formatSummary, recordRun } from '../lib/record.mjs'
import { parseArgs } from 'node:util'

const ARG_OPTIONS = {
  run: { type: 'string' },
  agent: { type: 'string' },
  transcript: { type: 'string' },
  stream: { type: 'string' },
  'duration-ms': { type: 'string' },
  'total-tokens': { type: 'string' },
  'tool-uses': { type: 'string' },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })
  const harnessKeys = ['duration-ms', 'total-tokens', 'tool-uses'].filter((key) => options[key])
  const harness = Object.fromEntries(harnessKeys.map((key) => [key, Number(options[key])]))
  const source = { agentId: options.agent, transcriptFile: options.transcript, streamFile: options.stream, harness }
  const record = recordRun(options.run, source)

  console.log(formatSummary(record))

  if (record.compliance.length) console.log(record.compliance.join('\n'))
}

main()
