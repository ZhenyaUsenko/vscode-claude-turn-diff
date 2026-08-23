import { mkdtempSync } from 'fs'
import { register } from 'module'
import os from 'os'
import path from 'path'

process.env.HOME = mkdtempSync(path.join(os.tmpdir(), 'turn-diff-test-'))

register('./utils/vscode-hooks.js', import.meta.url)
