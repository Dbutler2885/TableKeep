import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BLOCK_SIZE,
  DEFAULT_PORTS,
  PORTED_CONFIG_FILE,
  blockTempDir,
  clientEmulatorEnv,
  emulatorHostPort,
  firebaseConfigArgs,
  firebaseEnv,
  hashedBlockBase,
  portBlock,
  resolveEmulatorPorts,
  withEmulatorPorts,
} from './ports.mjs'
import { DEFAULT_EMULATOR_PORTS, emulatorPortsFromEnv } from '../../src/firebase/emulatorPorts'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const readRepoFile = (file) => readFileSync(path.join(repoRoot, file), 'utf8')
const baseConfig = JSON.parse(readRepoFile('firebase.json'))

/** A scratch checkout: `.git` is a directory for a clone, a file for a linked worktree. */
function withCheckout(kind, run) {
  const root = mkdtempSync(path.join(tmpdir(), 'tablekeep-ports-'))
  try {
    if (kind === 'clone') mkdirSync(path.join(root, '.git'))
    if (kind === 'worktree') writeFileSync(path.join(root, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n')
    writeFileSync(path.join(root, 'firebase.json'), readRepoFile('firebase.json'))
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const allPorts = (ports) => Object.values(ports)

describe('which ports a checkout gets', () => {
  it('keeps the standard ports in an ordinary clone', () => {
    withCheckout('clone', (root) => {
      expect(resolveEmulatorPorts({ env: {}, root })).toEqual({ source: 'checkout', base: null, ports: DEFAULT_PORTS })
    })
  })

  it('gives a linked worktree a block of its own, derived from its real path', () => {
    withCheckout('worktree', (root) => {
      const base = hashedBlockBase(realpathSync(root))
      expect(resolveEmulatorPorts({ env: {}, root })).toEqual({ source: 'worktree', base, ports: portBlock(base) })
      // Stable: asking again gives the same block.
      expect(resolveEmulatorPorts({ env: {}, root }).base).toBe(base)
    })
  })

  it('keeps the standard ports under CI, even in a linked worktree', () => {
    withCheckout('worktree', (root) => {
      expect(resolveEmulatorPorts({ env: { CI: 'true' }, root })).toEqual({ source: 'ci', base: null, ports: DEFAULT_PORTS })
      expect(resolveEmulatorPorts({ env: { CI: 'false' }, root }).source).toBe('worktree')
    })
  })

  it('lets TABLEKEEP_PORT_BASE win over everything, in either direction', () => {
    withCheckout('worktree', (root) => {
      expect(resolveEmulatorPorts({ env: { TABLEKEEP_PORT_BASE: 'default' }, root }))
        .toEqual({ source: 'override', base: null, ports: DEFAULT_PORTS })
    })
    withCheckout('clone', (root) => {
      expect(resolveEmulatorPorts({ env: { TABLEKEEP_PORT_BASE: '41000', CI: 'true' }, root }))
        .toEqual({ source: 'override', base: 41_000, ports: portBlock(41_000) })
    })
  })

  it.each(['8080x', '-1', '80', '65530', '1.5'])('refuses TABLEKEEP_PORT_BASE=%s rather than guessing', (value) => {
    expect(() => resolveEmulatorPorts({ env: { TABLEKEEP_PORT_BASE: value }, root: repoRoot })).toThrow(/TABLEKEEP_PORT_BASE/)
  })
})

describe('a port block', () => {
  it('fits inside its size and never repeats a port', () => {
    const ports = allPorts(portBlock(20_000))
    expect(new Set(ports).size).toBe(ports.length)
    expect(Math.min(...ports)).toBe(20_000)
    expect(Math.max(...ports)).toBeLessThan(20_000 + BLOCK_SIZE)
  })

  it('starts on a block boundary below the ephemeral ranges, clear of every standard port', () => {
    const standard = new Set(allPorts(DEFAULT_PORTS))
    for (let slot = 0; slot < 200; slot += 1) {
      const base = hashedBlockBase(`/worktrees/${slot}/HomeBoysHouse`)
      expect((base - 10_000) % BLOCK_SIZE).toBe(0)
      expect(base).toBeGreaterThanOrEqual(10_000)
      expect(base + BLOCK_SIZE).toBeLessThanOrEqual(32_000)
      for (const port of allPorts(portBlock(base))) expect(standard.has(port)).toBe(false)
    }
  })

  it('differs between two worktrees of the same repository', () => {
    expect(hashedBlockBase('/pool/13/HomeBoysHouse')).not.toBe(hashedBlockBase('/pool/14/HomeBoysHouse'))
  })
})

describe('the standard ports', () => {
  it('are the ones firebase.json pins', () => {
    for (const [name, entry] of Object.entries(baseConfig.emulators)) {
      if (typeof entry?.port !== 'number') continue
      expect(DEFAULT_PORTS[name]).toBe(entry.port)
    }
  })

  it('are the ones the browser client falls back to', () => {
    expect(DEFAULT_EMULATOR_PORTS).toEqual({
      auth: DEFAULT_PORTS.auth,
      firestore: DEFAULT_PORTS.firestore,
      storage: DEFAULT_PORTS.storage,
      functions: DEFAULT_PORTS.functions,
    })
  })
})

describe('the generated Firebase config', () => {
  it('pins every emulator in the block and keeps the rest of firebase.json', () => {
    const ports = portBlock(20_000)
    const config = withEmulatorPorts(baseConfig, ports)

    expect(config.emulators).toEqual({
      ...baseConfig.emulators,
      auth: { port: ports.auth },
      firestore: { port: ports.firestore, websocketPort: ports.firestoreWebsocket },
      storage: { port: ports.storage },
      functions: { port: ports.functions },
      ui: { enabled: true, port: ports.ui },
      hub: { port: ports.hub },
      logging: { port: ports.logging },
      eventarc: { port: ports.eventarc },
      tasks: { port: ports.tasks },
    })
    for (const [key, value] of Object.entries(baseConfig)) {
      if (key !== 'emulators') expect(config[key]).toEqual(value)
    }
  })

  it('is not generated at all on the standard ports, so firebase.json is used as it is', () => {
    withCheckout('clone', (root) => {
      expect(firebaseConfigArgs(resolveEmulatorPorts({ env: {}, root }), root)).toEqual([])
    })
  })

  it('is written beside firebase.json and passed with --config on a block', () => {
    withCheckout('worktree', (root) => {
      const resolved = resolveEmulatorPorts({ env: {}, root })
      expect(firebaseConfigArgs(resolved, root)).toEqual(['--config', PORTED_CONFIG_FILE])
      const written = JSON.parse(readFileSync(path.join(root, PORTED_CONFIG_FILE), 'utf8'))
      expect(written).toEqual(withEmulatorPorts(baseConfig, resolved.ports))
    })
  })

  it('is ignored by git', () => {
    expect(readRepoFile('.gitignore').split('\n')).toContain(PORTED_CONFIG_FILE)
  })
})

describe('what the browser client is told', () => {
  it('round-trips through the variables src/firebase reads', () => {
    const ports = portBlock(20_000)
    expect(emulatorPortsFromEnv(clientEmulatorEnv(ports))).toEqual({
      auth: ports.auth,
      firestore: ports.firestore,
      storage: ports.storage,
      functions: ports.functions,
    })
  })

  it('falls back to the standard ports when nothing is passed', () => {
    expect(emulatorPortsFromEnv({})).toEqual(DEFAULT_EMULATOR_PORTS)
  })

  it('refuses a variable that is not a port', () => {
    expect(() => emulatorPortsFromEnv({ VITE_FIRESTORE_EMULATOR_PORT: 'eighty' })).toThrow(/VITE_FIRESTORE_EMULATOR_PORT/)
  })
})

describe('reading an emulator host variable', () => {
  it('takes the port from the host firebase emulators:exec exported', () => {
    expect(emulatorHostPort({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:20001' }, 'FIRESTORE_EMULATOR_HOST', 8080)).toBe(20_001)
    expect(emulatorHostPort({ FIRESTORE_EMULATOR_HOST: '[::1]:20001' }, 'FIRESTORE_EMULATOR_HOST', 8080)).toBe(20_001)
  })

  it('falls back when the variable is missing', () => {
    expect(emulatorHostPort({}, 'FIRESTORE_EMULATOR_HOST', 8080)).toBe(8080)
  })
})

describe('the temporary directory firebase-tools is given', () => {
  const block = { source: 'worktree', base: 20_000, ports: portBlock(20_000) }
  const standard = { source: 'checkout', base: null, ports: { ...DEFAULT_PORTS } }

  it('is the block\'s own, so two checkouts never share Storage blobs or a hub locator', () => {
    const other = { source: 'worktree', base: 20_016, ports: portBlock(20_016) }
    expect(blockTempDir(block, '/tmp')).toBe('/tmp/tablekeep-20000')
    expect(blockTempDir(other, '/tmp')).not.toBe(blockTempDir(block, '/tmp'))
  })

  it('is not nested again when a wrapper runs inside one', () => {
    expect(blockTempDir(block, '/tmp/tablekeep-20000')).toBe('/tmp/tablekeep-20000')
  })

  it('leaves room for the functions emulator\'s sockets under a macOS temp directory', () => {
    // os.tmpdir() on macOS, and the socket name functions emulator workers use.
    const macTemp = '/var/folders/rn/8t9yt20d7ws7qy253blm2mjc0000gn/T'
    const socket = path.join(blockTempDir({ ...block, base: 31_984 }, macTemp), `fire_emu_${'0'.repeat(16)}.sock`)
    expect(Buffer.byteLength(socket)).toBeLessThan(104)
  })

  it('is left alone on the standard ports, as CI has always run', () => {
    expect(blockTempDir(standard, '/tmp')).toBeNull()
    const env = firebaseEnv(standard, { TMPDIR: '/tmp/original', PATH: '/bin' })
    expect(env).toEqual({ TMPDIR: '/tmp/original', PATH: '/bin', ...clientEmulatorEnv(standard.ports) })
  })
})
