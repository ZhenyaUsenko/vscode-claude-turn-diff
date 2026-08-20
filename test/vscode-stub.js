const state = {
  folders: [],
  executed: [],
  watchers: [],
  provider: null,
  providerOptions: null,
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const FileType = {
  File: 1,
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const FileSystemError = {
  FileNotFound: () => new Error('file not found'),
  NoPermissions: () => new Error('no permissions'),
  FileNotADirectory: () => new Error('not a directory'),
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class Uri {
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

class RelativePattern {
  constructor(base, pattern) {
    this.base = base
    this.pattern = pattern
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

class Disposable {
  constructor(callOnDispose) {
    this.dispose = callOnDispose
  }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const reset = (folders) => {
  state.folders = folders
  state.executed = []
  state.watchers = []
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const workspace = {
  get workspaceFolders() {
    return state.folders.map((folder) => ({ uri: Uri.file(folder) }))
  },
  createFileSystemWatcher: (pattern) => {
    const watcher = { pattern, disposed: false, dispose: () => { watcher.disposed = true } }

    state.watchers.push(watcher)

    return watcher
  },
  registerFileSystemProvider: (scheme, provider, options) => {
    state.provider = provider
    state.providerOptions = options

    return { dispose: () => {} }
  },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const commands = {
  executeCommand: async (command, title, resources) => {
    state.executed.push({ command, title, resources })
  },
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { Uri, RelativePattern, Disposable, FileType, FileSystemError, state, reset, workspace, commands }
