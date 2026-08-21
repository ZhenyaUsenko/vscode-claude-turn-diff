import { HOME } from './home.js'
import fs from 'fs'

const registeredChecks = []

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const check = (name, body) => {
  registeredChecks.push({ name, body })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const runChecks = async () => {
  let failedCount = 0

  for (const { name, body } of registeredChecks) {
    try {
      await body()

      console.log(`  ok    ${name}`)
    } catch (error) {
      failedCount++

      console.log(`  FAIL  ${name}\n        ${error.message}`)
    }
  }

  fs.rmSync(HOME, { recursive: true, force: true })
  console.log(failedCount ? `\n  ${failedCount} failing` : `\n  all ${registeredChecks.length} passing`)
  process.exit(failedCount ? 1 : 0)
}
