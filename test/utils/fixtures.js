import { HOME } from './home.js'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

let repoCounter = 0

const gitIn = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })

export const createRepo = () => {
  const repoDir = path.join(HOME, 'work', `repo${repoCounter++}`)

  fs.mkdirSync(repoDir, { recursive: true })

  gitIn(repoDir, 'init', '-q')
  gitIn(repoDir, 'config', 'user.email', 'test@example.com')
  gitIn(repoDir, 'config', 'user.name', 'test')

  return repoDir
}

export const commitAll = (dir) => {
  gitIn(dir, 'add', '-A')
  gitIn(dir, 'commit', '-qm', 'fixture')
}

export const write = (file, contents) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, contents)
}
