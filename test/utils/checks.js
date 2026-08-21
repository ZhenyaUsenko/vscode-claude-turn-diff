import { HOME } from './home.js'
import fs from 'fs'

const registeredChecks = []

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const check = (name, body) => {
  registeredChecks.push({ name, body })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const runChecks = async () => {
  let failed = 0

  for (const { name, body } of registeredChecks) {
    try {
      await body()

      console.log(`  ok    ${name}`)
    } catch (error) {
      failed++

      console.log(`  FAIL  ${name}\n        ${error.message}`)
    }
  }

  fs.rmSync(HOME, { recursive: true, force: true })
  console.log(failed ? `\n  ${failed} failing` : `\n  all ${registeredChecks.length} passing`)
  process.exit(failed ? 1 : 0)
}
