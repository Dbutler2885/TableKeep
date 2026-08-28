import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SANDBOX_EMULATORS, SANDBOX_PORTS, sandboxConfig } from './sandboxPorts.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const baseConfig = JSON.parse(readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'))
const clientSource = readFileSync(path.join(repoRoot, 'src/firebase/index.ts'), 'utf8')

describe('the sandbox rig port block', () => {
  it('uses the emulator ports the browser client is hardcoded to', () => {
    // `src/firebase/index.ts` connects the SDK to these as literals. An emulator
    // on any other port is one the app cannot reach, and a visitor meets
    // ERR_CONNECTION_REFUSED on the sandbox callable rather than a demo. If that
    // file ever learns to read its ports from the environment, this test is the
    // thing that says the rig may move again.
    expect(clientSource).toContain(`:${SANDBOX_PORTS.auth}`)
    expect(clientSource).toContain(`, ${SANDBOX_PORTS.firestore})`)
    expect(clientSource).toContain(`, ${SANDBOX_PORTS.functions})`)
    expect(clientSource).toContain(`, ${SANDBOX_PORTS.storage})`)
  })

  it('agrees with firebase.json on every emulator both files name', () => {
    for (const [name, entry] of Object.entries(baseConfig.emulators)) {
      if (typeof entry?.port !== 'number' || !(name in SANDBOX_PORTS)) continue
      expect(SANDBOX_PORTS[name]).toBe(entry.port)
    }
  })

  it('moves only the dev server, which nothing points at but the address bar', () => {
    expect(SANDBOX_PORTS.app).not.toBe(5173)
  })

  it('gives every emulator it starts a port', () => {
    const emulators = sandboxConfig(baseConfig).emulators
    for (const name of SANDBOX_EMULATORS.split(',')) {
      expect(emulators[name]?.port).toBeTypeOf('number')
    }
  })

  it('starts the functions emulator, which the plain demo does not', () => {
    // The sandbox hangs off a callable; without this the "try it now" button is
    // a button to nothing.
    expect(SANDBOX_EMULATORS.split(',')).toContain('functions')
  })
})

describe('the generated Firebase config', () => {
  it('keeps everything except the emulator block from firebase.json', () => {
    const generated = sandboxConfig(baseConfig)

    for (const [key, value] of Object.entries(baseConfig)) {
      if (key === 'emulators') continue
      expect(generated[key]).toEqual(value)
    }
    // Which is the reason it is generated rather than committed: the rules
    // paths and the functions source keep one definition.
    expect(generated.firestore.rules).toBe('firestore.rules')
    expect(generated.storage.rules).toBe('storage.rules')
    expect(generated.functions.source).toBe('functions')
  })
})
