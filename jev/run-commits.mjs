import { sendRequest } from './lib/client.mjs'
import { buildCommitBatch } from './lib/commits.mjs'
import { parseArgs } from 'node:util'

const CONCURRENCY = 6
const USD_PER_TOKEN = 0.042 / 1e6

const ARG_OPTIONS = { limit: { type: 'string', default: '18' } }

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatPercent = (value) => `${Math.round(value * 100)}%`

const getMean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

const getSwappedSlot = (slot) => slot === 'a' ? 'b' : 'a'

const getRealNoul = (record, result) => result.answers[`matches_${record.realSlot}`].noul

const getSwappedNoul = (record, result) => result.answers[`matches_${getSwappedSlot(record.realSlot)}`].noul

const isRealPicked = (record, result) => result.answers.which_message.choice === record.realSlot

const isKindExpected = (record, result) => result.answers.kind.choice === record.expectedKind

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const postRequest = (request) => sendRequest('/systemone', request.body, `commits-${request.name}`)

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const runInBatches = async (items, worker) => {
  const results = []

  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batchResults = await Promise.all(items.slice(i, i + CONCURRENCY).map(worker))

    results.push(...batchResults)
  }

  return results
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatBlindRow = (record, result) => {
  const { kind, changes_runtime_behavior: behavior, blast_radius: blast } = result.answers
  const kindMark = isKindExpected(record, result) ? ' ' : '!'
  const kindCell = `${kind.choice} ${formatPercent(kind.probabilities[kind.choice])} conf ${kind.confidence.toFixed(2)}`
  const cells = [
    record.hash,
    record.expectedKind.padEnd(15),
    kindMark,
    kindCell.padEnd(34),
    `behavior ${formatPercent(behavior.noul)}`.padEnd(14),
    `blast ${blast.score.toFixed(2)}`,
    `${result.elapsedMs}ms`.padStart(7),
    `${result.usage.input_tokens} tok`,
  ]

  return cells.join('  ')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatVerifyRow = (record, result) => {
  const { which_message: which } = result.answers
  const pickMark = isRealPicked(record, result) ? ' ' : '!'
  const cells = [
    record.hash,
    `real ${formatPercent(getRealNoul(record, result))}`.padEnd(10),
    `swapped ${formatPercent(getSwappedNoul(record, result))}`.padEnd(13),
    pickMark,
    `picked ${which.choice}, real at ${formatPercent(which.probabilities[record.realSlot])}`.padEnd(26),
    `${result.elapsedMs}ms`.padStart(7),
    record.message,
  ]

  return cells.join('  ')
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printSummary = (records, blindResults, verifyResults) => {
  const kindHits = records.filter((record, i) => isKindExpected(record, blindResults[i])).length
  const pickHits = records.filter((record, i) => isRealPicked(record, verifyResults[i])).length
  const realNouls = records.map((record, i) => getRealNoul(record, verifyResults[i]))
  const swappedNouls = records.map((record, i) => getSwappedNoul(record, verifyResults[i]))
  const allResults = [...blindResults, ...verifyResults]
  const totalTokens = allResults.reduce((sum, result) => sum + result.usage.input_tokens, 0)
  const meanMs = Math.round(getMean(allResults.map((result) => result.elapsedMs)))
  const costUsd = (totalTokens * USD_PER_TOKEN).toFixed(4)

  console.log(`model ${blindResults[0].model}`)
  console.log(`kind agrees with my label ${kindHits}/${records.length}`)
  console.log(`real message picked ${pickHits}/${records.length}`)
  console.log(`mean noul real ${formatPercent(getMean(realNouls))}, swapped ${formatPercent(getMean(swappedNouls))}`)
  console.log(`${allResults.length} requests, ${totalTokens} input tokens, mean ${meanMs}ms, cost $${costUsd}`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const { values: options } = parseArgs({ options: ARG_OPTIONS })
  const batch = buildCommitBatch(Number(options.limit))
  const records = batch.map((item) => item.record)
  const blindResults = await runInBatches(batch, (item) => postRequest(item.blind))
  const verifyResults = await runInBatches(batch, (item) => postRequest(item.verify))

  console.log('=== blind: kind / runtime behavior / blast radius (expected = my reading of the commit message) ===')
  records.forEach((record, i) => console.log(formatBlindRow(record, blindResults[i])))
  console.log()
  console.log('=== verify: real message vs a message borrowed from another commit ===')
  records.forEach((record, i) => console.log(formatVerifyRow(record, verifyResults[i])))
  console.log()
  printSummary(records, blindResults, verifyResults)
}

main()
