import { getServerFile } from './store/paths.js'
import { handleTurn } from './turn/index.js'
import { readFile, removeFile, replaceFile } from './utils/files.js'
import { getCurrentProject, getWorkspaceDirs } from './utils/workspace.js'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const parseRequest = (buffer) => {
  const endOfHeader = buffer.indexOf('\n')

  if (endOfHeader < 0) return null

  const endOfBody = buffer.indexOf('\n', endOfHeader + 1)

  if (endOfBody < 0) return null

  const [token, mode, project] = buffer.slice(0, endOfHeader).split('\t')
  const body = buffer.slice(endOfHeader + 1, endOfBody)

  return { token, mode, project, body }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const serve = (socket, token, log, onPublish) => {
  let buffer = ''

  socket.setEncoding('utf8')

  socket.on('data', async (chunk) => {
    buffer += chunk

    const request = parseRequest(buffer)

    if (!request) return

    buffer = ''

    if (request.token !== token) return void socket.end('err\n')

    try {
      const outcome = await handleTurn(request.mode, request.project, JSON.parse(request.body), getWorkspaceDirs())

      if (outcome?.published) onPublish?.()
    } catch (error) {
      log?.(`${request.mode} failed: ${error.stack}`)

      return void socket.end('err\n')
    }

    socket.end('ok\n')
  })

  socket.on('error', () => {})
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const withdrawAdvert = (advertState) => {
  const { writtenFile, writtenContents } = advertState

  if (!writtenFile) return

  if (readFile(writtenFile, 'utf8') === writtenContents) removeFile(writtenFile)

  advertState.writtenFile = null
  advertState.writtenContents = null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const advertise = (advertState) => {
  const { server, token, log } = advertState
  const port = server.address()?.port

  if (!port) return void withdrawAdvert(advertState)

  const advertFile = getServerFile(getCurrentProject())
  const contents = JSON.stringify({ port, token, pid: process.pid })

  if (readFile(advertFile, 'utf8') === contents) return

  withdrawAdvert(advertState)

  try {
    replaceFile(advertFile, contents, { mode: 0o600 })

    advertState.writtenFile = advertFile
    advertState.writtenContents = contents
  } catch (error) {
    log?.(`could not advertise: ${error.message}`)
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const disposeServer = (advertState) => {
  withdrawAdvert(advertState)

  try { advertState.server.close() } catch {}
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const startServer = (log, onPublish) => {
  const token = randomBytes(24).toString('hex')
  const server = createServer((socket) => serve(socket, token, log, onPublish))
  const advertState = { server, token, log, writtenFile: null, writtenContents: null }

  server.on('error', (error) => log?.(`server error: ${error.message}`))
  server.listen(0, '127.0.0.1', () => advertise(advertState))

  return { readvertise: () => advertise(advertState), dispose: () => disposeServer(advertState) }
}
