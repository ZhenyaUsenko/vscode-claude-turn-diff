import { join } from 'node:path'

export const JEV_DIR = new URL('../', import.meta.url).pathname

export const REPO_DIR = join(JEV_DIR, '..')

export const LOGS_DIR = join(JEV_DIR, 'logs')
