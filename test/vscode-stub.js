const state = {
  folders: [],
  executed: [],
  watchers: [],
  provider: null,
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

const reset = (folders) => {
  state.folders = folders
  state.executed = []
  state.watchers = []
}

const createFileSystemWatcher = (pattern) => {
  const watcher = { pattern, disposed: false, dispose: () => { watcher.disposed = true } }

  state.watchers.push(watcher)

  return watcher
}

const registerTextDocumentContentProvider = (scheme, provider) => {
  state.provider = provider

  return { dispose: () => {} }
}

const executeCommand = async (command, title, resources) => {
  state.executed.push({ command, title, resources })
}

module.exports = {
  Uri,
  RelativePattern,
  state,
  reset,
  workspace: {
    get workspaceFolders() {
      return state.folders.map((folder) => ({ uri: Uri.file(folder) }))
    },
    createFileSystemWatcher,
    registerTextDocumentContentProvider,
  },
  commands: { executeCommand },
}
