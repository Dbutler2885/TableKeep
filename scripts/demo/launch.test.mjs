import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { demoEmulatorArgs, startEmulatorProcess, startViteProcess } from './launch.mjs'
import { DEFAULT_PORTS, PORTED_CONFIG_FILE, portBlock } from '../emulators/ports.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const standard = { source: 'checkout', base: null, ports: { ...DEFAULT_PORTS } }
const block = { source: 'worktree', base: 20_000, ports: portBlock(20_000) }

function withRoot(run) {
  const root = mkdtempSync(path.join(tmpdir(), 'tablekeep-launch-'))
  try {
    writeFileSync(path.join(root, 'firebase.json'), readFileSync(path.join(repoRoot, 'firebase.json')))
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('the demo emulators\' arguments', () => {
  it('imports the snapshot and never writes it back in visitor mode', () => {
    expect(demoEmulatorArgs({ mode: 'visitor', hasSnapshot: true, resolved: standard })).toEqual([
      'emulators:start', '--only', 'auth,firestore,storage', '--project', 'homeboyshouse-dev', '--import=./emulator-data',
    ])
  })

  it('exports back to the snapshot on exit in author mode, importing it only when there is one', () => {
    expect(demoEmulatorArgs({ mode: 'author', hasSnapshot: false, resolved: standard })).toEqual([
      'emulators:start', '--only', 'auth,firestore,storage', '--project', 'homeboyshouse-dev', '--export-on-exit=./emulator-data',
    ])
  })

  it('starts on the checkout\'s own config on a block', () => {
    withRoot((root) => {
      const args = demoEmulatorArgs({ mode: 'visitor', hasSnapshot: true, resolved: block, root })
      expect(args.slice(0, 3)).toEqual(['--config', PORTED_CONFIG_FILE, 'emulators:start'])
      expect(JSON.parse(readFileSync(path.join(root, PORTED_CONFIG_FILE), 'utf8')).emulators.auth.port).toBe(block.ports.auth)
    })
  })
})

describe('starting the rig\'s children', () => {
  it('starts firebase-tools detached, on the given JDK and the block\'s temp directory', () => {
    const spawn = vi.fn(() => 'child')
    const child = startEmulatorProcess({ args: ['emulators:start'], javaPath: '/jdk/bin', resolved: block, root: '/repo', spawn })

    expect(child).toBe('child')
    const [command, args, options] = spawn.mock.calls[0]
    expect(command).toBe(process.execPath)
    expect(args[0]).toMatch(/node_modules\/firebase-tools\/lib\/bin\/firebase\.js$/)
    expect(args.slice(1)).toEqual(['emulators:start'])
    expect(options).toMatchObject({ cwd: '/repo', detached: true, stdio: ['ignore', 'inherit', 'inherit'] })
    expect(options.env.PATH).toBe('/jdk/bin')
    expect(options.env.TMPDIR).toMatch(/tablekeep-20000$/)
  })

  it('starts Vite detached on a strict port, with the given variables on top of this environment', () => {
    const spawn = vi.fn(() => 'child')
    startViteProcess({ port: 20_010, env: { VITE_DEMO_SANDBOX: 'true' }, root: '/repo', spawn })

    const [, args, options] = spawn.mock.calls[0]
    expect(args[0]).toMatch(/node_modules\/vite\/bin\/vite\.js$/)
    expect(args.slice(1)).toEqual(['--host', '127.0.0.1', '--port', '20010', '--strictPort'])
    expect(options).toMatchObject({ cwd: '/repo', detached: true })
    expect(options.env.VITE_DEMO_SANDBOX).toBe('true')
    expect(options.env.PATH).toBe(process.env.PATH)
  })
})
