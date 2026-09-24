export const stubState = {
  registeredCommands: [],
  loggedErrors: [],
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
  workspaceFolders: undefined,
  createFileSystemWatcher: () => new Disposable(() => {}),
  registerFileSystemProvider: () => new Disposable(() => {}),
  onDidChangeWorkspaceFolders: () => new Disposable(() => {}),
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const window = {
  createOutputChannel: () => ({ error: (message) => { stubState.loggedErrors.push(message) }, dispose: () => {} }),
  onDidChangeWindowState: () => new Disposable(() => {}),
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const commands = {
  executeCommand: async () => {},
  registerCommand: (command) => {
    stubState.registeredCommands.push(command)

    return new Disposable(() => {})
  },
}
