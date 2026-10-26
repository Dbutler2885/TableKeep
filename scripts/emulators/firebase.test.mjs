import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { main, runFirebase } from './firebase.mjs'
import { DEFAULT_PORTS, PORTED_CONFIG_FILE, clientEmulatorEnv, portBlock } from './ports.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const standard = { source: 'checkout', base: null, ports: { ...DEFAULT_PORTS } }
const block = { source: 'worktree', base: 20_000, ports: portBlock(20_000) }

/** A stand-in for `spawn` that records its call and returns a child the test can make exit. */
function fakeSpawn() {
  const child = Object.assign(new EventEmitter(), { kill: vi.fn() })
  const spawn = vi.fn(() => child)
  return { spawn, child }
}

/** A scratch checkout, with the system temp directory moved inside it so a block's temp directory lands there too. */
function withRoot(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'tablekeep-wrapper-'))
  try {
    writeFileSync(path.join(root, 'firebase.json'), readFileSync(path.join(repoRoot, 'firebase.json')))
    mkdirSync(path.join(root, 'node_modules'))
    mkdirSync(path.join(root, 'tmp'))
    vi.stubEnv('TMPDIR', path.join(root, 'tmp'))
    return run(root)
  } finally {
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  }
}

describe('running firebase-tools', () => {
  it('passes the arguments through untouched on the standard ports', () => {
    const { spawn } = fakeSpawn()
    runFirebase(['emulators:exec', '--only', 'firestore', 'vitest run'], standard, { spawn, signals: new EventEmitter(), exit: vi.fn() })

    const [command, args, options] = spawn.mock.calls[0]
    expect(command).toBe(process.execPath)
    expect(args.slice(1)).toEqual(['emulators:exec', '--only', 'firestore', 'vitest run'])
    expect(args[0]).toMatch(/node_modules\/firebase-tools\/lib\/bin\/firebase\.js$/)
    expect(options.env).toMatchObject(clientEmulatorEnv(standard.ports))
    expect(options.stdio).toBe('inherit')
  })

  it('points firebase-tools at the generated config and its own temp directory on a block', () => {
    withRoot((root) => {
      const { spawn } = fakeSpawn()
      runFirebase(['emulators:start'], block, { root, spawn, signals: new EventEmitter(), exit: vi.fn() })

      const [, args, options] = spawn.mock.calls[0]
      expect(args.slice(1)).toEqual(['--config', PORTED_CONFIG_FILE, 'emulators:start'])
      expect(JSON.parse(readFileSync(path.join(root, PORTED_CONFIG_FILE), 'utf8')).emulators.firestore.port).toBe(block.ports.firestore)
      expect(options.env.TMPDIR).toBe(path.join(root, 'tmp', 'tablekeep-20000'))
      expect(options.env.VITE_FIRESTORE_EMULATOR_PORT).toBe(String(block.ports.firestore))
    })
  })

  it('passes SIGINT and SIGTERM on, so the emulators are stopped rather than orphaned', () => {
    const { spawn, child } = fakeSpawn()
    const signals = new EventEmitter()
    runFirebase([], standard, { spawn, signals, exit: vi.fn() })

    signals.emit('SIGINT')
    signals.emit('SIGTERM')
    expect(child.kill.mock.calls).toEqual([['SIGINT'], ['SIGTERM']])
  })

  it.each([
    [[0, null], 0],
    [[3, null], 3],
    [[null, 'SIGKILL'], 1],
    [[null, null], 0],
  ])('exits with firebase-tools\' status once it has stopped (%j -> %i)', ([code, signal], expected) => {
    const { spawn, child } = fakeSpawn()
    const exit = vi.fn()
    runFirebase([], standard, { spawn, signals: new EventEmitter(), exit })

    expect(exit).not.toHaveBeenCalled()
    child.emit('exit', code, signal)
    expect(exit).toHaveBeenCalledWith(expected)
  })
})

describe('the command line entry point', () => {
  it.each(['emulators:exec', 'emulators:start'])('says which ports %s uses and checks they are free before starting', async (command) => {
    const calls = []
    const log = (line) => calls.push(['log', line])
    const assertFree = async (resolved) => { calls.push(['assertFree', resolved.base]) }
    const run = (args, resolved) => { calls.push(['run', args, resolved.base]) }

    await main([command, '--only', 'firestore'], { resolved: block, log, assertFree, run })

    expect(calls.map(([step]) => step)).toEqual(['log', 'assertFree', 'run'])
    expect(calls[0][1]).toContain('block 20000-20015')
    expect(calls[2]).toEqual(['run', [command, '--only', 'firestore'], 20_000])
  })

  it('does not start a run on a block that is taken', async () => {
    const run = vi.fn()
    const assertFree = async () => { throw new Error('ports are in use') }
    await expect(main(['emulators:exec'], { resolved: block, log: vi.fn(), assertFree, run })).rejects.toThrow('ports are in use')
    expect(run).not.toHaveBeenCalled()
  })

  it('runs any other command straight away', async () => {
    const log = vi.fn()
    const assertFree = vi.fn()
    const run = vi.fn()
    await main(['emulators:export', './emulator-data'], { resolved: block, log, assertFree, run })

    expect(log).not.toHaveBeenCalled()
    expect(assertFree).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith(['emulators:export', './emulator-data'], block)
  })
})
