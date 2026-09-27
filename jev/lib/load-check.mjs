import { createContext, stubState } from '../suite/vscode/stub.mjs'
import './vscode-register.mjs'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SETTLE_MS = 60

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const checkSyntax = (sourceFile) => execFileSync(process.execPath, ['--check', sourceFile], { stdio: 'pipe' })

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listSourceFiles = (codeDir) => {
  const srcDir = join(codeDir, 'src')
  const names = readdirSync(srcDir, { recursive: true }).filter((name) => name.endsWith('.js'))

  return names.map((name) => join(srcDir, name))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const readDeclaredCommands = (codeDir) => {
  const { contributes } = JSON.parse(readFileSync(join(codeDir, 'package.json'), 'utf8'))

  return contributes.commands.map(({ command }) => command)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const activateExtension = async (codeDir) => {
  const context = createContext(codeDir)

  process.env.HOME = mkdtempSync(join(tmpdir(), 'turn-diff-load-'))

  try {
    const { activate } = await import(pathToFileURL(join(codeDir, 'src', 'extension.js')).href)

    activate(context)

    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))

    return [...stubState.registeredCommands.keys()]
  } finally {
    for (const subscription of context.subscriptions) subscription.dispose()

    rmSync(process.env.HOME, { recursive: true, force: true })
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const main = async () => {
  const codeDir = process.argv[2]
  const declaredCommands = readDeclaredCommands(codeDir).toSorted()
  const commandsReason = 'every command package.json declares is registered'

  listSourceFiles(codeDir).forEach(checkSyntax)
  execFileSync('bash', ['-n', join(codeDir, 'hooks', 'turn-diff.sh')], { stdio: 'pipe' })

  const registeredCommands = await activateExtension(codeDir)

  assert.deepStrictEqual(stubState.loggedErrors, [], 'activation logged no errors')
  assert.deepStrictEqual(registeredCommands.toSorted(), declaredCommands, commandsReason)
}

main()
