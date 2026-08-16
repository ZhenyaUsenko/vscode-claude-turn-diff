import fs from 'fs'
import { register } from 'module'
import os from 'os'
import path from 'path'

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-diff-test-'))

register('./vscode-hooks.js', import.meta.url)
