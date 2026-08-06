// Loopback server the hook talks to.
//
// Wire format, two lines:
//   <token>\t<mode>\t<project>\n
//   <raw hook payload json>\n
// reply: "ok\n" or "err\n". The hook waits for it, because `arm` has to finish
// snapshotting before the tool it precedes is allowed to run.
//
// Bound to 127.0.0.1 on an ephemeral port and guarded by a token that only
// exists in a 0600 file inside the project's state directory — advertised the
// same way Claude Code advertises its own IDE server in ~/.claude/ide.

const crypto = require('crypto')
const fs = require('fs')
const net = require('net')
const path = require('path')

const { projectKey, serverDirFor, serverFileFor } = require('./util/paths')
const { handle } = require('./turn')

const dropDeadAdvertisements = (directory) => {
  let names = []
  try {
    names = fs.readdirSync(directory)
  } catch {
    return
  }
  for (const name of names) {
    const pid = Number(name.replace(/\.json$/, ''))
    if (!Number.isInteger(pid) || pid === process.pid) continue
    try {
      process.kill(pid, 0) // signal 0 only tests for existence
    } catch (error) {
      // EPERM means it exists but belongs to someone else, so leave it
      if (error.code === 'ESRCH') {
        try {
          fs.unlinkSync(path.join(directory, name))
        } catch {}
      }
    }
  }
}

const parseRequest = (buffer) => {
  const endOfHeader = buffer.indexOf('\n')
  if (endOfHeader < 0) return null
  const endOfBody = buffer.indexOf('\n', endOfHeader + 1)
  if (endOfBody < 0) return null

  const [token, mode, project] = buffer.slice(0, endOfHeader).split('\t')
  const body = buffer.slice(endOfHeader + 1, endOfBody)
  return { token, mode, project, body }
}

const start = (getWorkspaceFolders, log) => {
  const token = crypto.randomBytes(24).toString('hex')
  let advertisedAt = null

  const withdraw = () => {
    if (!advertisedAt) return
    try {
      fs.unlinkSync(advertisedAt)
    } catch {}
    advertisedAt = null
  }

  const server = net.createServer((socket) => {
    socket.setEncoding('utf8')
    let buffer = ''

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
        await handle(request.mode, request.project, JSON.parse(request.body), getWorkspaceFolders())
        socket.end('ok\n')
      } catch (error) {
        log?.(`${request.mode} failed: ${error && error.stack ? error.stack : error}`)
        socket.end('err\n')
      }
    })
    socket.on('error', () => {})
  })

  server.on('error', (error) => log?.(`server error: ${error.message}`))

  // Re-advertised when the first workspace folder changes, since that is what
  // the project key derives from. Only ever writes and removes this process's
  // own file, so a second window on the same project is left alone.
  const advertise = () => {
    const folders = getWorkspaceFolders()
    const port = server.address()?.port
    if (!folders.length || !port) {
      withdraw()
      return
    }

    const project = projectKey(folders[0])
    const file = serverFileFor(project, process.pid)
    if (file === advertisedAt && fs.existsSync(file)) return

    withdraw()
    try {
      const directory = serverDirFor(project)
      fs.mkdirSync(directory, { recursive: true })
      dropDeadAdvertisements(directory)
      fs.writeFileSync(file, JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 })
      advertisedAt = file
    } catch (error) {
      log?.(`could not advertise: ${error.message}`)
    }
  }

  server.listen(0, '127.0.0.1', advertise)

  return {
    readvertise: advertise,
    dispose: () => {
      withdraw()
      try {
        server.close()
      } catch {}
    },
  }
}

module.exports = { start }
