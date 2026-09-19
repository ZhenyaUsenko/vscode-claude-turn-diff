import { sendRequest } from './lib/client.mjs'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const main = async () => {
  const [target] = process.argv.slice(2)

  if (target === 'models') return sendRequest('/models')

  const body = JSON.parse(await readFile(target, 'utf8'))

  return sendRequest('/systemone', body, basename(target, '.json'))
}

main().then((result) => console.log(JSON.stringify(result, null, 2)))
