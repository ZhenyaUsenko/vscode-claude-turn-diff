import { getProjectKey, getServerDir, getServerFile } from './store/paths.js'
import { handleTurn } from './turn/index.js'
import { outputFile, listEntries, removeFile } from './utils/files.js'
import { getWorkspaceFolders } from './utils/workspace.js'
import { randomBytes } from 'crypto'
import { existsSync } from 'fs'
import { createServer } from 'net'
import { join } from 'path'

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

const dropDeadAdvertisements = (serverDir) => {
  for (const entry of listEntries(serverDir)) {
    const pid = +entry.name.replace(/\.json$/, '')

    if (!Number.isInteger(pid) || pid === process.pid) continue

    try {
      process.kill(pid, 0)
    } catch (error) {
      if (error.code !== 'ESRCH') continue

      removeFile(join(serverDir, entry.name))
    }
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const serve = (socket, token, log) => {
  let buffer = ''

  socket.setEncoding('utf8')

  socket.on('data', async (chunk) => {
    buffer += chunk

    const request = parseRequest(buffer)

    if (!request) return

    buffer = ''

    if (request.token !== token) return void socket.end('err\n')

    try {
      await handleTurn(request.mode, request.project, JSON.parse(request.body), getWorkspaceFolders())

      socket.end('ok\n')
    } catch (error) {
      log?.(`${request.mode} failed: ${error.stack}`)
      socket.end('err\n')
    }
  })

  socket.on('error', () => {})
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const withdrawAdvert = (advertState) => {
  if (!advertState.writtenAdvert) return

  removeFile(advertState.writtenAdvert)

  advertState.writtenAdvert = null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const advertise = (advertState) => {
  const { server, token, log } = advertState
  const workspaceFolders = getWorkspaceFolders()
  const port = server.address()?.port

  if (!workspaceFolders.length || !port) return void withdrawAdvert(advertState)

  const project = getProjectKey(workspaceFolders[0])
  const targetAdvert = getServerFile(project, process.pid)

  if (targetAdvert === advertState.writtenAdvert && existsSync(targetAdvert)) return

  withdrawAdvert(advertState)

  try {
    dropDeadAdvertisements(getServerDir(project))
    outputFile(targetAdvert, JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 })

    advertState.writtenAdvert = targetAdvert
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

export const startServer = (log) => {
  const token = randomBytes(24).toString('hex')
  const server = createServer((socket) => serve(socket, token, log))
  const advertState = { server, token, log, writtenAdvert: null }

  server.on('error', (error) => log?.(`server error: ${error.message}`))
  server.listen(0, '127.0.0.1', () => advertise(advertState))

  return { readvertise: () => advertise(advertState), dispose: () => disposeServer(advertState) }
}
