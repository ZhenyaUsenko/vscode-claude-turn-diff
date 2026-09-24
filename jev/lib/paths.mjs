import { join } from 'node:path'

export const JEV_DIR = new URL('../', import.meta.url).pathname

export const REPO_DIR = join(JEV_DIR, '..')

export const TESTS_DIR = join(JEV_DIR, 'tests')

export const LOGS_DIR = join(JEV_DIR, 'logs')

export const RUNS_DIR = join(JEV_DIR, 'runs')

export const REAL_DIR = join(RUNS_DIR, 'real')
