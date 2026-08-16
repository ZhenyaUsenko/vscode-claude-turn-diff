const STUB = new URL('./vscode-stub.js', import.meta.url).href

const resolve = (specifier, context, nextResolve) => {
  if (specifier !== 'vscode') return nextResolve(specifier, context)

  return { url: STUB, shortCircuit: true }
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export { resolve }
