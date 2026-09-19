import { readRun } from './lib/runs.mjs'

const FLAG_DELTA = 0.15

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatPercent = (value) => `${Math.round(value * 100)}%`.padStart(4)

const formatDelta = (value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}`.padStart(4)

const getMean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildRows = (baseRun, otherRun) => {
  const rows = Object.keys(baseRun.nouls).map((id) => {
    const base = baseRun.nouls[id]
    const other = otherRun.nouls[id]

    return { id, base, other, delta: other - base }
  })

  return rows.sort((a, b) => a.delta - b.delta)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const [baseLabel, otherLabel] = process.argv.slice(2)
  const baseRun = readRun(baseLabel)
  const otherRun = readRun(otherLabel)
  const rows = buildRows(baseRun, otherRun)
  const flaggedCount = rows.filter((row) => Math.abs(row.delta) >= FLAG_DELTA).length

  console.log(`${baseRun.label} -> ${otherRun.label}`)

  for (const row of rows) {
    const flag = Math.abs(row.delta) >= FLAG_DELTA ? '!' : ' '
    const movement = `${formatPercent(row.base)} -> ${formatPercent(row.other)}  ${formatDelta(row.delta)}`

    console.log(`  ${flag} ${movement}  ${row.id}`)
  }

  const baseMean = getMean(rows.map((row) => row.base))
  const otherMean = getMean(rows.map((row) => row.other))

  console.log(`mean ${formatPercent(baseMean)} -> ${formatPercent(otherMean)}, ${flaggedCount} moved 15 points or more`)
}

main()
