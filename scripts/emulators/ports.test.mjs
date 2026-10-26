import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BLOCK_SIZE,
  DEFAULT_PORTS,
  PORTED_CONFIG_FILE,
  assertBlockIsFree,
  blockTempDir,
  clientEmulatorEnv,
  describeEmulatorPorts,
  emulatorHostPort,
  firebaseConfigArgs,
  firebaseEnv,
  hashedBlockBase,
  portBlock,
  portIsFree,
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

  it('treats an empty TABLEKEEP_PORT_BASE as unset', () => {
    withCheckout('clone', (root) => {
      expect(resolveEmulatorPorts({ env: { TABLEKEEP_PORT_BASE: '' }, root }).source).toBe('checkout')
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

  it('treats an empty variable as unset', () => {
    expect(emulatorPortsFromEnv({ VITE_AUTH_EMULATOR_PORT: '' }).auth).toBe(DEFAULT_EMULATOR_PORTS.auth)
  })

  it.each(['eighty', '0', '65536', '80.5'])('refuses %s, which is not a port', (value) => {
    expect(() => emulatorPortsFromEnv({ VITE_FIRESTORE_EMULATOR_PORT: value })).toThrow(/VITE_FIRESTORE_EMULATOR_PORT/)
  })
})

describe('reading an emulator host variable', () => {
  it('takes the port from the host firebase emulators:exec exported', () => {
    expect(emulatorHostPort({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:20001' }, 'FIRESTORE_EMULATOR_HOST', 8080)).toBe(20_001)
    expect(emulatorHostPort({ FIRESTORE_EMULATOR_HOST: '[::1]:20001' }, 'FIRESTORE_EMULATOR_HOST', 8080)).toBe(20_001)
  })

  it('falls back when the variable is missing or names no port', () => {
    expect(emulatorHostPort({}, 'FIRESTORE_EMULATOR_HOST', 8080)).toBe(8080)
    expect(emulatorHostPort({ FIRESTORE_EMULATOR_HOST: 'localhost' }, 'FIRESTORE_EMULATOR_HOST', 8080)).toBe(8080)
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

  it('is created and handed to firebase-tools as TMPDIR on a block', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'tablekeep-tmp-'))
    try {
      const env = firebaseEnv(block, { PATH: '/bin' }, tmp)
      expect(env).toEqual({ PATH: '/bin', ...clientEmulatorEnv(block.ports), TMPDIR: path.join(tmp, 'tablekeep-20000') })
      expect(existsSync(env.TMPDIR)).toBe(true)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('is left alone on the standard ports, as CI has always run', () => {
    expect(blockTempDir(standard, '/tmp')).toBeNull()
    const env = firebaseEnv(standard, { TMPDIR: '/tmp/original', PATH: '/bin' })
    expect(env).toEqual({ TMPDIR: '/tmp/original', PATH: '/bin', ...clientEmulatorEnv(standard.ports) })
  })
})

describe('the line that says which ports are in use', () => {
  it.each([
    [{ source: 'worktree', base: 20_000, ports: portBlock(20_000) }, 'block 20000-20015 (chosen for this worktree)'],
    [{ source: 'override', base: 41_000, ports: portBlock(41_000) }, 'block 41000-41015 (set by TABLEKEEP_PORT_BASE)'],
    [{ source: 'ci', base: null, ports: { ...DEFAULT_PORTS } }, 'the standard ports (under CI)'],
    [{ source: 'checkout', base: null, ports: { ...DEFAULT_PORTS } }, 'the standard ports (this checkout is not a linked worktree)'],
  ])('names the block and why for %j', (resolved, expected) => {
    const line = describeEmulatorPorts(resolved)
    expect(line).toContain(expected)
    expect(line).toContain(`firestore ${resolved.ports.firestore}`)
    expect(line).toContain('TABLEKEEP_PORT_BASE')
  })
})

describe('the check that a block is free', () => {
  const block = { source: 'worktree', base: 20_000, ports: portBlock(20_000) }

  it('passes when every port the emulators take is free', async () => {
    await expect(assertBlockIsFree(block, async () => true)).resolves.toBeUndefined()
  })

  it('names each taken port and how to move', async () => {
    const taken = new Set([block.ports.firestore, block.ports.hub])
    await expect(assertBlockIsFree(block, async (port) => !taken.has(port)))
      .rejects.toThrow(/in use: firestore 20001, hub 20006\.[\s\S]*TABLEKEEP_PORT_BASE/)
  })

  it('leaves the standard ports to firebase-tools', async () => {
    const isFree = async () => { throw new Error('should not be asked') }
    await expect(assertBlockIsFree({ source: 'ci', base: null, ports: { ...DEFAULT_PORTS } }, isFree)).resolves.toBeUndefined()
  })

  it('sees a port another process is listening on as taken, and a released one as free', async () => {
    const server = net.createServer()
    await new Promise((resolve) => server.listen({ port: 0, host: '127.0.0.1' }, resolve))
    const { port } = server.address()
    try {
      expect(await portIsFree(port)).toBe(false)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
    expect(await portIsFree(port)).toBe(true)
  })
})
