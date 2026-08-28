import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SANDBOX_EMULATORS, SANDBOX_PORTS, sandboxConfig } from './sandboxPorts.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const baseConfig = JSON.parse(readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'))

describe('the sandbox rig port block', () => {
  it('shares no port with the default block in firebase.json', () => {
    // The whole point of the block: `npm run demo:sandbox` is left running while
    // somebody clicks around, and must not be why another worktree's emulators
    // or `npm run test:emulator` cannot start.
    const defaults = Object.values(baseConfig.emulators)
      .map((entry) => entry?.port)
      .filter((port) => typeof port === 'number')

    for (const port of Object.values(SANDBOX_PORTS)) {
      expect(defaults).not.toContain(port)
    }
  })

  it('pins the Firestore websocket port, which otherwise defaults into the default block', () => {
    // Left unset the Firestore emulator picks 9150 - a port `firebase.json`
    // never mentions, so nothing else here would have caught the collision.
    expect(SANDBOX_PORTS.firestoreWebsocket).toBeTypeOf('number')
    expect(SANDBOX_PORTS.firestoreWebsocket).not.toBe(9150)
    expect(sandboxConfig(baseConfig).emulators.firestore.websocketPort).toBe(SANDBOX_PORTS.firestoreWebsocket)
  })

  it('gives every emulator it starts a port', () => {
    const emulators = sandboxConfig(baseConfig).emulators
    for (const name of SANDBOX_EMULATORS.split(',')) {
      expect(emulators[name]?.port).toBeTypeOf('number')
    }
  })

  it('starts the functions emulator, which the plain demo does not', () => {
    // The sandbox hangs off a callable; without this the "try it now" link is
    // a link to nothing.
    expect(SANDBOX_EMULATORS.split(',')).toContain('functions')
  })
})

describe('the generated Firebase config', () => {
  it('keeps everything except the port block from firebase.json', () => {
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
