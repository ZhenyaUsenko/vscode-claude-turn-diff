import { HOME } from './home.js'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

let repoCounter = 0

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const createRepo = () => {
  const repoDir = join(HOME, 'work', `repo${repoCounter++}`)

  mkdirSync(repoDir, { recursive: true })

  execFileSync('git', ['-C', repoDir, 'init', '-q'], { stdio: 'ignore' })
  execFileSync('git', ['-C', repoDir, 'config', 'user.email', 'test@example.com'], { stdio: 'ignore' })
  execFileSync('git', ['-C', repoDir, 'config', 'user.name', 'test'], { stdio: 'ignore' })

  return repoDir
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const commitAll = (dir) => {
  execFileSync('git', ['-C', dir, 'add', '-A'], { stdio: 'ignore' })
  execFileSync('git', ['-C', dir, 'commit', '-qm', 'fixture'], { stdio: 'ignore' })
}
