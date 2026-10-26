// Which ports this checkout's Firebase emulators and local app servers use.
//
// Several checkouts of this repository run on one machine at once - linked git
// worktrees, each with its own agent - and every one of them starts the same
// emulators. On `firebase.json`'s fixed ports the second one to start fails, or
// worse, its tests talk to the first one's emulator. So each linked worktree
// gets a port block of its own, derived from its path: stable for as long as
// the worktree stays where it is, and different from its neighbours'.
//
// The ports are decided in this order:
//
//   1. `TABLEKEEP_PORT_BASE=<port>` puts the block at that port, and
//      `TABLEKEEP_PORT_BASE=default` asks for the standard ports. Either one is
//      an explicit choice and wins over everything below.
//   2. Under CI (`CI` set) the standard ports, so the workflow runs exactly the
//      `firebase.json` it always has.
//   3. In a linked worktree (its `.git` is a file, not a directory) a block
//      chosen from a hash of the worktree's real path.
//   4. Everywhere else - an ordinary clone - the standard ports, which are the
//      ones the README names.
//
// Every place that starts the emulators or connects to them reads the ports
// from here: `scripts/emulators/firebase.mjs` for the npm scripts, the demo and
// sandbox rigs, the browser smoke and the floor rehearsal. The browser client
// is told through the `VITE_*_EMULATOR_PORT` variables `clientEmulatorEnv`
// returns, which `src/firebase/emulatorPorts.ts` reads.

import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

/** The override variable. A port number, or `default`. */
export const PORT_BASE_VARIABLE = 'TABLEKEEP_PORT_BASE'

/**
 * The standard ports: `firebase.json`'s emulators, firebase-tools' functions
 * default, and the app servers the scripts have always used.
 *
 * The hub, the logging emulator, the Firestore WebSocket and the Eventarc and
 * Tasks emulators are left out on purpose. `firebase.json` does not pin them,
 * so firebase-tools picks a free port for each of them, and the standard setup
 * keeps doing exactly that.
 */
export const DEFAULT_PORTS = Object.freeze({
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
  ui: 4000,
  /** `npm run demo` and `npm run demo:author`. */
  app: 5173,
  /** `npm run demo:sandbox`. */
  sandboxApp: 5185,
  /** `npm run test:browser-smoke`. */
  smokeApp: 4173,
})

/** Where each port sits in a block. Every port is pinned there, so nothing is left to chance. */
const BLOCK_OFFSETS = Object.freeze({
  auth: 0,
  firestore: 1,
  firestoreWebsocket: 2,
  storage: 3,
  functions: 4,
  ui: 5,
  hub: 6,
  logging: 7,
  eventarc: 8,
  tasks: 9,
  app: 10,
  sandboxApp: 11,
  smokeApp: 12,
})

export const BLOCK_SIZE = 16

/**
 * Hashed blocks start in [10000, 32000). That stays clear of every standard
 * port above, and below the ephemeral range Linux (32768+) and macOS (49152+)
 * hand out to outgoing connections, so a browser tab cannot be sitting on one.
 */
const HASHED_RANGE_START = 10_000
const HASHED_RANGE_END = 32_000
const HASHED_BLOCK_COUNT = Math.floor((HASHED_RANGE_END - HASHED_RANGE_START) / BLOCK_SIZE)

/** A block of ports starting at `base`. */
export function portBlock(base) {
  return Object.fromEntries(Object.entries(BLOCK_OFFSETS).map(([name, offset]) => [name, base + offset]))
}

/** The block base for a worktree at `worktreePath`: the same path always gives the same base. */
export function hashedBlockBase(worktreePath) {
  const digest = createHash('sha256').update(worktreePath).digest()
  return HASHED_RANGE_START + (digest.readUInt32BE(0) % HASHED_BLOCK_COUNT) * BLOCK_SIZE
}

function parseOverride(value) {
  if (value === 'default') return null
  const base = Number(value)
  if (!Number.isInteger(base) || base < 1024 || base + BLOCK_SIZE - 1 > 65_535) {
    throw new Error(
      `${PORT_BASE_VARIABLE}=${value} is not usable. Set it to "default" or to a port from 1024 to ${65_535 - BLOCK_SIZE + 1}; `
      + `the block takes ${BLOCK_SIZE} ports from there.`,
    )
  }
  return base
}

function isLinkedWorktree(root) {
  const gitPath = path.join(root, '.git')
  return existsSync(gitPath) && lstatSync(gitPath).isFile()
}

/**
 * This checkout's ports, and why they are what they are.
 *
 * `source` is `override`, `ci`, `worktree` or `checkout`. `base` is the block's
 * first port, or null for the standard ports.
 */
export function resolveEmulatorPorts({ env = process.env, root = repoRoot } = {}) {
  const override = env[PORT_BASE_VARIABLE]
  if (override !== undefined && override !== '') {
    const base = parseOverride(override)
    return base === null
      ? { source: 'override', base: null, ports: { ...DEFAULT_PORTS } }
      : { source: 'override', base, ports: portBlock(base) }
  }

  if (env.CI && env.CI !== 'false') {
    return { source: 'ci', base: null, ports: { ...DEFAULT_PORTS } }
  }

  if (isLinkedWorktree(root)) {
    const base = hashedBlockBase(realpathSync(root))
    return { source: 'worktree', base, ports: portBlock(base) }
  }

  return { source: 'checkout', base: null, ports: { ...DEFAULT_PORTS } }
}

/** One line saying which ports are in use and how to move them. */
export function describeEmulatorPorts({ source, base, ports }) {
  const why = {
    override: `set by ${PORT_BASE_VARIABLE}`,
    ci: 'under CI',
    worktree: 'chosen for this worktree',
    checkout: 'this checkout is not a linked worktree',
  }[source]
  const block = base === null ? 'the standard ports' : `block ${base}-${base + BLOCK_SIZE - 1}`
  return `Firebase emulators on ${block} (${why}): auth ${ports.auth}, firestore ${ports.firestore}, `
    + `storage ${ports.storage}, functions ${ports.functions}, UI ${ports.ui}. `
    + `Set ${PORT_BASE_VARIABLE} to a port, or to "default", to move them.`
}

/**
 * `firebase.json` with this checkout's ports in its emulator block.
 *
 * Only the emulators the config already names, plus the ones firebase-tools
 * would otherwise place on its own (hub, logging, Eventarc, Tasks, the
 * Firestore WebSocket), are pinned; everything else in the config is kept.
 */
export function withEmulatorPorts(baseConfig, ports) {
  const emulators = { ...baseConfig.emulators }
  const pin = (name, port) => {
    if (port !== undefined) emulators[name] = { ...emulators[name], port }
  }

  pin('auth', ports.auth)
  pin('firestore', ports.firestore)
  if (ports.firestoreWebsocket !== undefined) {
    emulators.firestore = { ...emulators.firestore, websocketPort: ports.firestoreWebsocket }
  }
  pin('storage', ports.storage)
  pin('functions', ports.functions)
  pin('ui', ports.ui)
  pin('hub', ports.hub)
  pin('logging', ports.logging)
  pin('eventarc', ports.eventarc)
  pin('tasks', ports.tasks)

  return { ...baseConfig, emulators }
}

/** The committed `firebase.json`, which every generated config starts from. */
export function readFirebaseJson(root = repoRoot) {
  return JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8'))
}

/** Where the per-worktree config is written. Ignored by git; see `.gitignore`. */
export const PORTED_CONFIG_FILE = 'firebase.ports.json'

/**
 * Writes `config` to `file` in `root`, whole or not at all.
 *
 * Two commands in one worktree can start at the same moment, and both write
 * this file; renaming a finished copy into place means neither ever reads the
 * other's half-written one. The content is the same either way.
 */
export function writeFirebaseConfig(root, file, config) {
  const target = path.join(root, file)
  const temporary = `${target}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`)
  renameSync(temporary, target)
  return target
}

/**
 * The `--config` arguments for a firebase-tools command in this checkout.
 *
 * Under the standard ports there are none, so firebase-tools reads
 * `firebase.json` exactly as it always has. Otherwise `firebase.ports.json` is
 * generated beside it - in the repository root, because firebase-tools
 * resolves a config's relative paths, and the project root, from the config
 * file's own directory.
 */
export function firebaseConfigArgs(resolved, root = repoRoot) {
  if (resolved.base === null) return []
  const config = withEmulatorPorts(readFirebaseJson(root), resolved.ports)
  writeFirebaseConfig(root, PORTED_CONFIG_FILE, config)
  return ['--config', PORTED_CONFIG_FILE]
}

/**
 * The variables that point the browser client at these emulators.
 *
 * Vite only exposes `VITE_*` variables to the bundle, and only the ones in its
 * environment when it starts (or builds), so every command that starts Vite
 * against the emulators passes these in.
 */
export function clientEmulatorEnv(ports) {
  return {
    VITE_AUTH_EMULATOR_PORT: String(ports.auth),
    VITE_FIRESTORE_EMULATOR_PORT: String(ports.firestore),
    VITE_STORAGE_EMULATOR_PORT: String(ports.storage),
    VITE_FUNCTIONS_EMULATOR_PORT: String(ports.functions),
  }
}

/**
 * A temporary directory of this block's own, for firebase-tools to use as
 * `TMPDIR`, or null on the standard ports.
 *
 * firebase-tools keeps two things in the system temp directory that every
 * emulator suite on the machine shares. The Storage emulator stores its blobs
 * in `firebase/storage/blobs` there and deletes that whole directory when it
 * stops, so one checkout finishing pulls every other running checkout's
 * uploads out from under it. And the hub writes one locator file per project
 * id, which is how `firebase emulators:export` finds the emulators to export,
 * so with one project id across all checkouts an export can reach another
 * checkout's data. A temp directory per block keeps both to this checkout.
 *
 * The name is short on purpose: the functions emulator puts unix sockets in it,
 * and macOS caps a socket path at 104 bytes.
 */
export function blockTempDir(resolved, tmp = os.tmpdir()) {
  if (resolved.base === null) return null
  const name = `tablekeep-${resolved.base}`
  // Already inside one (a wrapper started from a command a wrapper started).
  return path.basename(tmp) === name ? tmp : path.join(tmp, name)
}

/**
 * The environment for a firebase-tools process, and every command it runs, on
 * this checkout's ports: the browser client's port variables and, on a block,
 * the block's own `TMPDIR` (created here).
 */
export function firebaseEnv(resolved, env = process.env) {
  const tempDir = blockTempDir(resolved)
  if (tempDir) mkdirSync(tempDir, { recursive: true })
  return { ...env, ...clientEmulatorEnv(resolved.ports), ...(tempDir ? { TMPDIR: tempDir } : {}) }
}

/**
 * The port in an emulator host variable such as `FIRESTORE_EMULATOR_HOST`,
 * or `fallback` when it is not set.
 *
 * `firebase emulators:exec` exports these for the emulators it actually
 * started, so a script running inside it trusts them over its own reckoning.
 */
export function emulatorHostPort(env, variable, fallback) {
  const host = env[variable]
  if (!host) return fallback
  const port = Number.parseInt(host.split(':').at(-1) ?? '', 10)
  return Number.isInteger(port) ? port : fallback
}

/** The emulators in a block that must be free before anything starts on it. */
const STARTED_PORTS = ['auth', 'firestore', 'firestoreWebsocket', 'storage', 'functions', 'ui', 'hub', 'logging', 'eventarc', 'tasks']

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(() => resolve(true)))
  })
}

/**
 * Fails early, and says why, when a port in this checkout's block is taken.
 *
 * firebase-tools would fail on its own, but with a message that does not say
 * the port was chosen for this worktree or how to choose another.
 */
export async function assertBlockIsFree(resolved) {
  // The standard ports are firebase-tools' to check, exactly as they always were.
  if (resolved.base === null) return

  const taken = []
  for (const name of STARTED_PORTS) {
    if (!(await portIsFree(resolved.ports[name]))) taken.push(`${name} ${resolved.ports[name]}`)
  }
  if (taken.length === 0) return

  throw new Error(
    `This checkout's emulator ports are in use: ${taken.join(', ')}.\n`
    + 'Either this checkout already has emulators running (stop them first), or another\n'
    + `process holds them. To use a different block, set ${PORT_BASE_VARIABLE} to another port.`,
  )
}
