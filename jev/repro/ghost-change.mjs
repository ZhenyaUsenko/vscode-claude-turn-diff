import { readManifest } from '../../src/store/manifest.js'
import { getProjectKey } from '../../src/store/paths.js'
import { outputFile } from '../../src/utils/files.js'
import { commitAll, createRepo } from '../../test/utils/fixtures.js'
import { HOME } from '../../test/utils/home.js'
import { runTurn } from '../../test/utils/turn.js'
import { join } from 'node:path'

const repoDir = createRepo()
const project = getProjectKey(repoDir)
const neverWrittenFile = join(HOME, 'outside', 'never-written.md')

outputFile(join(repoDir, 'f.txt'), 'one\n')
commitAll(repoDir)

await runTurn(repoDir, 'chat', [repoDir], () => outputFile(join(repoDir, 'f.txt'), 'two\n'))

const previousManifest = readManifest(project)

await runTurn(repoDir, 'chat', [repoDir], () => {}, { touchedFiles: [neverWrittenFile] })

const currentManifest = readManifest(project)
const listNames = (manifest) => manifest.changes.map((change) => change.afterFile.split('/').pop())

console.log('previous diff lists:', listNames(previousManifest))
console.log('after a turn that changed nothing, the diff lists:', listNames(currentManifest))
console.log('previous diff replaced:', previousManifest.ts !== currentManifest.ts)
process.exit(0)
