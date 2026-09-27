const EMPTY_PROVIDER = { provider: null, providerScheme: null, providerOptions: null }

const listeners = {
  windowState: new Set(),
  workspaceFolders: new Set(),
}

export const stubState = {
  workspaceDirs: [],
  registeredCommands: new Map(),
  executedCommands: [],
  loggedErrors: [],
  shownMessages: [],
  messageAnswer: undefined,
  watchers: [],
  provider: null,
  providerScheme: null,
  providerOptions: null,
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const FileType = {
  File: 1,
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const FileSystemError = {
  FileNotFound: () => new Error('file not found'),
  NoPermissions: () => new Error('no permissions'),
  FileNotADirectory: () => new Error('not a directory'),
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class Uri {
  constructor(scheme, fsPath, query) {
    this.scheme = scheme
    this.path = fsPath
    this.query = query
  }

  static file(fsPath) {
    return new Uri('file', fsPath, '')
  }

  get fsPath() {
    return this.path
  }

  with({ scheme = this.scheme, query = this.query }) {
    return new Uri(scheme, this.path, query)
  }

  toString() {
    return `${this.scheme}://${this.path}${this.query ? `?${this.query}` : ''}`
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class RelativePattern {
  constructor(base, pattern) {
    this.base = base
    this.pattern = pattern
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class Disposable {
  constructor(callOnDispose) {
    this.dispose = callOnDispose
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const listen = (group, listener) => {
  group.add(listener)

  return new Disposable(() => group.delete(listener))
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const showMessage = async (level, args) => {
  stubState.shownMessages.push({ level, args })

  return stubState.messageAnswer
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const resetStub = ({ workspaceDirs = [], messageAnswer } = {}) => {
  const lists = [stubState.executedCommands, stubState.loggedErrors, stubState.shownMessages, stubState.watchers]

  Object.assign(stubState, { workspaceDirs, messageAnswer, ...EMPTY_PROVIDER })
  stubState.registeredCommands.clear()

  for (const list of lists) list.length = 0

  for (const group of Object.values(listeners)) group.clear()
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const setWorkspaceFolders = (workspaceDirs) => {
  stubState.workspaceDirs = workspaceDirs

  for (const listener of listeners.workspaceFolders) listener({ added: [], removed: [] })
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const fireWindowState = (windowState) => {
  for (const listener of listeners.windowState) listener(windowState)
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const createContext = (extensionPath) => {
  const storedValues = new Map()
  const get = (key) => storedValues.get(key)
  const update = async (key, value) => void storedValues.set(key, value)

  return { subscriptions: [], extensionPath, globalState: { get, update } }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const workspace = {
  get workspaceFolders() {
    if (!stubState.workspaceDirs.length) return undefined

    return stubState.workspaceDirs.map((workspaceDir) => ({ uri: Uri.file(workspaceDir) }))
  },
  createFileSystemWatcher: (pattern) => {
    const watcher = { pattern, disposed: false, dispose: () => { watcher.disposed = true } }

    stubState.watchers.push(watcher)

    return watcher
  },
  registerFileSystemProvider: (scheme, provider, options) => {
    Object.assign(stubState, { provider, providerScheme: scheme, providerOptions: options })

    return new Disposable(() => { stubState.provider = null })
  },
  onDidChangeWorkspaceFolders: (listener) => listen(listeners.workspaceFolders, listener),
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const window = {
  createOutputChannel: () => ({ error: (message) => { stubState.loggedErrors.push(message) }, dispose: () => {} }),
  onDidChangeWindowState: (listener) => listen(listeners.windowState, listener),
  showInformationMessage: (...args) => showMessage('info', args),
  showErrorMessage: (...args) => showMessage('error', args),
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const commands = {
  executeCommand: async (command, ...args) => {
    stubState.executedCommands.push({ command, args })
  },
  registerCommand: (command, handler) => {
    stubState.registeredCommands.set(command, handler)

    return new Disposable(() => stubState.registeredCommands.delete(command))
  },
}
