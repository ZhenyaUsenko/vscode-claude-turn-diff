import os from 'os'

export const HOME = process.env.HOME

if (!HOME.startsWith(os.tmpdir())) throw new Error('run the tests through npm test, HOME must be a temp directory')
