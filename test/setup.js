import { mkdtempSync } from 'fs'
import { register } from 'module'
import os from 'os'
import { join } from 'path'

process.env.HOME = mkdtempSync(join(os.tmpdir(), 'turn-diff-test-'))

register('./utils/vscode-hooks.js', import.meta.url)
