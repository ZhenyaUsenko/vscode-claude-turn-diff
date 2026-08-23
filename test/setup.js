import { mkdtempSync } from 'fs'
import { register } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.HOME = mkdtempSync(join(tmpdir(), 'turn-diff-test-'))

register('./utils/vscode-hooks.js', import.meta.url)
