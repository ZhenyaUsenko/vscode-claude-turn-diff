import * as turn from './turn/index.js'
import { projectKey, serverDirFor, serverFileFor } from './util/paths.js'
import { getWorkspaceFolders } from './util/workspace.js'
import crypto from 'crypto'
import fs from 'fs'
import net from 'net'
import path from 'path'

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
  let advertNames = []

  try { advertNames = fs.readdirSync(serverDir) } catch { return }

  for (const name of advertNames) {
    const pid = Number(name.replace(/\.json$/, ''))

    if (!Number.isInteger(pid) || pid === process.pid) continue

    try {
      process.kill(pid, 0)
    } catch (error) {
      if (error.code !== 'ESRCH') continue

      try { fs.unlinkSync(path.join(serverDir, name)) } catch {}
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

    if (request.token !== token) {
      socket.end('err\n')

      return
    }

    try {
      await turn.handle(request.mode, request.project, JSON.parse(request.body), getWorkspaceFolders())

      socket.end('ok\n')
    } catch (error) {
      log?.(`${request.mode} failed: ${error && error.stack ? error.stack : error}`)
      socket.end('err\n')
    }
  })

  socket.on('error', () => {})
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const withdrawAdvert = (advertState) => {
  if (!advertState.writtenAdvert) return

  try { fs.unlinkSync(advertState.writtenAdvert) } catch {}

  advertState.writtenAdvert = null
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const advertise = (advertState) => {
  const { server, token, log } = advertState
  const workspaceFolders = getWorkspaceFolders()
  const port = server.address()?.port

  if (!workspaceFolders.length || !port) {
    withdrawAdvert(advertState)

    return
  }

  const project = projectKey(workspaceFolders[0])
  const targetAdvert = serverFileFor(project, process.pid)

  if (targetAdvert === advertState.writtenAdvert && fs.existsSync(targetAdvert)) return

  withdrawAdvert(advertState)

  try {
    const serverDir = serverDirFor(project)

    fs.mkdirSync(serverDir, { recursive: true })
    dropDeadAdvertisements(serverDir)
    fs.writeFileSync(targetAdvert, JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 })

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

const start = (log) => {
  const token = crypto.randomBytes(24).toString('hex')
  const server = net.createServer((socket) => serve(socket, token, log))
  const advertState = { server, token, log, writtenAdvert: null }

  server.on('error', (error) => log?.(`server error: ${error.message}`))
  server.listen(0, '127.0.0.1', () => advertise(advertState))

  return { readvertise: () => advertise(advertState), dispose: () => disposeServer(advertState) }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { start }
