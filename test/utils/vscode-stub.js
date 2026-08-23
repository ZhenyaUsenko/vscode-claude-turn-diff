export const stubState = {
  folders: [],
  executed: [],
  watchers: [],
  provider: null,
  providerOptions: null,
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const resetStub = (folders) => {
  stubState.folders = folders
  stubState.executed = []
  stubState.watchers = []
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

export const workspace = {
  get workspaceFolders() {
    return stubState.folders.map((folder) => ({ uri: Uri.file(folder) }))
  },
  createFileSystemWatcher: (pattern) => {
    const watcher = { pattern, disposed: false, dispose: () => { watcher.disposed = true } }

    stubState.watchers.push(watcher)

    return watcher
  },
  registerFileSystemProvider: (scheme, provider, options) => {
    stubState.provider = provider
    stubState.providerOptions = options

    return { dispose: () => {} }
  },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const commands = {
  executeCommand: async (command, title, resources) => {
    stubState.executed.push({ command, title, resources })
  },
}
