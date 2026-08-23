import { mkdtempSync } from 'node:fs'
import { register } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.HOME = mkdtempSync(join(tmpdir(), 'turn-diff-test-'))

register('./utils/vscode-hooks.js', import.meta.url)
