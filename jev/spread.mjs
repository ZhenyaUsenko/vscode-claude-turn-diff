import { readRun } from './lib/runs.mjs'

const PASS_THRESHOLD = 0.5

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const formatPercent = (value) => `${Math.round(value * 100)}%`.padStart(4)

const formatPoints = (value) => String(Math.round(value * 100)).padStart(3)

const getMean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length

const countPasses = (values) => values.filter((value) => value >= PASS_THRESHOLD).length

const countRangesAtLeast = (ranges, points) => ranges.filter((range) => range >= points / 100).length

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getStandardDeviation = (values) => {
  const mean = getMean(values)

  return Math.sqrt(getMean(values.map((value) => (value - mean) ** 2)))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const getMedian = (values) => {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const buildRows = (runs) => {
  const rows = Object.keys(runs[0].nouls).map((id) => {
    const values = runs.map((run) => run.nouls[id])
    const passCount = countPasses(values)
    const flips = passCount > 0 && passCount < values.length

    return { id, values, range: Math.max(...values) - Math.min(...values), sd: getStandardDeviation(values), flips }
  })

  return rows.sort((a, b) => b.range - a.range)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printRows = (rows) => {
  for (const row of rows) {
    const values = row.values.map(formatPercent).join(' ')
    const flag = row.flips ? 'flip' : '    '

    console.log(`  ${values}   range ${formatPoints(row.range)}  sd ${formatPoints(row.sd)}  ${flag}  ${row.id}`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const printSummary = (runs, rows) => {
  const ranges = rows.map((row) => row.range)
  const sds = rows.map((row) => row.sd)
  const runMeans = runs.map((run) => formatPercent(getMean(Object.values(run.nouls))))
  const runPasses = runs.map((run) => countPasses(Object.values(run.nouls)))
  const flipCount = rows.filter((row) => row.flips).length
  const rangeSummary = `mean ${formatPoints(getMean(ranges))}, median ${formatPoints(getMedian(ranges))}`
  const sdSummary = `mean ${formatPoints(getMean(sds))}, median ${formatPoints(getMedian(sds))}`
  const bucketSummary = [10, 15, 20].map((points) => `>= ${points}: ${countRangesAtLeast(ranges, points)}`)

  console.log(`${runs.length} identical runs, ${rows.length} tests`)
  console.log(`run means ${runMeans.join(' ')}, pass counts ${runPasses.join(' ')}`)
  console.log(`per-test range in points: ${rangeSummary}, max ${formatPoints(Math.max(...ranges))}`)
  console.log(`per-test standard deviation in points: ${sdSummary}`)
  console.log(`tests with range ${bucketSummary.join(', ')}`)
  console.log(`tests flipping across 50%: ${flipCount}`)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = () => {
  const labels = process.argv.slice(2)
  const runs = labels.map(readRun)
  const rows = buildRows(runs)

  console.log(`runs: ${labels.join(', ')}`)
  printRows(rows)
  console.log()
  printSummary(runs, rows)
}

main()
