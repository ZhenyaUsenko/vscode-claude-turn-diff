import { stubState } from './vscode-stub.mjs'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const STUB_URL = new URL('./vscode-stub.mjs', import.meta.url).href

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

const createContext = (codeDir) => {
  const storedValues = new Map()
  const get = (key) => storedValues.get(key)
  const update = async (key, value) => storedValues.set(key, value)

  return { subscriptions: [], extensionPath: codeDir, globalState: { get, update } }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const resolveVscode = (specifier, context, nextResolve) => {
  if (specifier !== 'vscode') return nextResolve(specifier, context)

  return { url: STUB_URL, shortCircuit: true }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const activateExtension = async (codeDir) => {
  const context = createContext(codeDir)

  process.env.HOME = mkdtempSync(join(tmpdir(), 'turn-diff-load-'))

  try {
    const { activate } = await import(pathToFileURL(join(codeDir, 'src', 'extension.js')).href)

    activate(context)

    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))

    for (const subscription of context.subscriptions) subscription.dispose()
  } finally {
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
  registerHooks({ resolve: resolveVscode })

  await activateExtension(codeDir)

  assert.deepStrictEqual(stubState.loggedErrors, [], 'activation logged no errors')
  assert.deepStrictEqual(stubState.registeredCommands.toSorted(), declaredCommands, commandsReason)
}

main()
