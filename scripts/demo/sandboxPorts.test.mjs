import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PORTS, portBlock } from '../emulators/ports.mjs'
import { SANDBOX_EMULATORS, sandboxConfig, sandboxPorts } from './sandboxPorts.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const baseConfig = JSON.parse(readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'))

const standard = { source: 'checkout', base: null, ports: { ...DEFAULT_PORTS } }
const block = { source: 'worktree', base: 20_000, ports: portBlock(20_000) }

describe('the sandbox rig port block', () => {
  it('uses the standard ports, with the dev server moved off 5173, in an ordinary checkout', () => {
    expect(sandboxPorts(standard)).toEqual({
      auth: 9099,
      firestore: 8080,
      storage: 9199,
      functions: 5001,
      ui: 4000,
      app: 5185,
    })
  })

  it('moves with the checkout onto its own block', () => {
    const ports = sandboxPorts(block)
    expect(ports.firestore).toBe(block.ports.firestore)
    expect(ports.functions).toBe(block.ports.functions)
    expect(ports.app).toBe(block.ports.sandboxApp)
  })

  it('never shares a dev server port with `npm run demo`', () => {
    for (const resolved of [standard, block]) {
      expect(sandboxPorts(resolved).app).not.toBe(resolved.ports.app)
    }
  })

  it('gives every emulator it starts the port the rig waits on', () => {
    for (const resolved of [standard, block]) {
      const emulators = sandboxConfig(baseConfig, resolved).emulators
      const ports = sandboxPorts(resolved)
      for (const name of SANDBOX_EMULATORS.split(',')) {
        expect(emulators[name]?.port).toBe(ports[name])
      }
      expect(emulators.ui).toEqual({ enabled: true, port: ports.ui })
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
    const generated = sandboxConfig(baseConfig, block)

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
