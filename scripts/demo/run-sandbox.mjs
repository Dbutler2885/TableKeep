// Runs the hosted "try it now" demo entirely on this machine.
//
//   npm run demo:sandbox
//
// This is the local counterpart of the deployed sandbox, and the only way to
// exercise it end to end without a Firebase project. It differs from
// `npm run demo` in three ways, all of which the sandbox needs:
//
//   1. It starts the **functions** emulator, because the whole feature hangs off
//      the `createDemoSandboxSession` callable.
//   2. It seeds the demo **template** campaign into the emulator from the
//      committed snapshot, because a visitor's sandbox is a clone of it.
//   3. It sets `VITE_DEMO_SANDBOX=true`, which is what puts the "try it now"
//      link back on the sign-in screen against the emulators. See
//      `src/features/demo/demoAvailability.ts`.
//
// It runs on this checkout's emulator ports (see `scripts/emulators/ports.mjs`),
// so it can sit alongside another worktree's emulators, and on a dev server
// port of its own.
//
// Nothing here reaches a real Firebase project: every port is on 127.0.0.1, the
// web config is the placeholder set in `.env.demo`, and the snapshot is only
// ever read.

import { existsSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { demoEnv, projectId, repoRoot, snapshotDir } from './config.mjs'
import { resolveJavaPath } from './java.mjs'
import { startEmulatorProcess, startViteProcess } from './launch.mjs'
import { SANDBOX_CONFIG_FILE, SANDBOX_EMULATORS, sandboxBanner, sandboxPorts, writeSandboxConfig } from './sandboxPorts.mjs'
import { assertBlockIsFree, clientEmulatorEnv, describeEmulatorPorts, resolveEmulatorPorts } from '../emulators/ports.mjs'

const EMULATOR_READY_TIMEOUT_MS = 180_000
const APP_READY_TIMEOUT_MS = 60_000
const SHUTDOWN_GRACE_MS = 20_000

const emulatorPorts = resolveEmulatorPorts()
const SANDBOX_PORTS = sandboxPorts(emulatorPorts)

/** What the sandbox's dev server is started with, on top of this process's environment. */
const sandboxAppEnv = {
  ...demoEnv,
  ...clientEmulatorEnv(emulatorPorts.ports),
  // Puts the "try it now" link back on the sign-in screen. Without it the
  // link is hidden against the emulators, because the two other builds
  // that run there cannot serve the callable behind it.
  VITE_DEMO_SANDBOX: 'true',
  // The seat picker is the *other* demo. Offering both on one screen would
  // muddle which door a reviewer is meant to walk through.
  VITE_DEMO_GM_EMAIL: '',
  VITE_DEMO_GM_PASSWORD: '',
  VITE_DEMO_PLAYER_EMAIL: '',
  VITE_DEMO_PLAYER_PASSWORD: '',
}

function parseSnapshotDir() {
  const flag = process.argv.slice(2).find((arg) => arg.startsWith('--snapshot='))
  return flag ? path.resolve(process.cwd(), flag.slice('--snapshot='.length)) : snapshotDir
}

const url = (port) => `http://127.0.0.1:${port}`

/**
 * Seeds the template into the running emulator.
 *
 * `seed-template.mjs` normally runs inside `firebase emulators:exec`, which
 * exports the emulator hosts it started. This rig uses `emulators:start`, which
 * does not, so the same three variables are supplied here by hand.
 */
function seedTemplate() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, 'scripts/demo/seed-template.mjs'), '--apply'],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          GCLOUD_PROJECT: projectId,
          FIRESTORE_EMULATOR_HOST: `127.0.0.1:${SANDBOX_PORTS.firestore}`,
          FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${SANDBOX_PORTS.storage}`,
        },
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    )

    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(output.trim().split('\n').at(-1) ?? '')
        return
      }
      reject(new Error(`Seeding the demo template failed (exit ${code}).`))
    })
  })
}

async function waitForHttp(target, label, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready (code ${child.exitCode}).`)
    }
    try {
      await fetch(target)
      return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`${label} was not ready at ${target} within ${Math.round(timeoutMs / 1000)} seconds.`)
}

async function stopChild(child, signal, graceMs) {
  if (child.exitCode !== null || child.signalCode !== null) return

  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill(signal)

  const timedOut = Symbol('timed-out')
  const outcome = await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(() => resolve(timedOut), graceMs)),
  ])

  if (outcome === timedOut) {
    child.kill('SIGKILL')
    await exited
  }
}

function preflight() {
  const snapshot = parseSnapshotDir()

  if (!existsSync(snapshot) || readdirSync(snapshot).length === 0) {
    throw new Error(
      `No demo snapshot at ${snapshot}.\n`
      + 'The sandbox template is seeded from the same snapshot `npm run demo` imports.\n'
      + 'Pass --snapshot=<dir> to point at one somewhere else.',
    )
  }

  if (!existsSync(path.join(repoRoot, 'functions/node_modules'))) {
    throw new Error(
      'The Cloud Functions package has no dependencies installed, and the sandbox\n'
      + 'callable runs in the functions emulator. Run: npm ci --prefix functions',
    )
  }

  return { snapshot, javaPath: resolveJavaPath() }
}

let snapshot
let javaPath

try {
  ({ snapshot, javaPath } = preflight())
  console.log(describeEmulatorPorts(emulatorPorts))
  await assertBlockIsFree(emulatorPorts)
  writeSandboxConfig(repoRoot, emulatorPorts)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const emulators = startEmulatorProcess({
  args: [
    'emulators:start',
    '--config', SANDBOX_CONFIG_FILE,
    '--only', SANDBOX_EMULATORS,
    '--project', projectId,
    `--import=${snapshot}`,
  ],
  javaPath,
  resolved: emulatorPorts,
})
let app = null
let shuttingDown = false

async function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true

  if (app) await stopChild(app, 'SIGTERM', 5_000)
  await stopChild(emulators, 'SIGINT', SHUTDOWN_GRACE_MS)

  process.exit(code)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { void shutdown(0) })
}

emulators.on('exit', (code) => {
  if (shuttingDown) return
  console.error(`\nThe Firebase emulators exited (code ${code}). Shutting down.`)
  void shutdown(code ?? 1)
})

try {
  for (const [label, port] of [
    ['Auth emulator', SANDBOX_PORTS.auth],
    ['Firestore emulator', SANDBOX_PORTS.firestore],
    ['Storage emulator', SANDBOX_PORTS.storage],
    ['Functions emulator', SANDBOX_PORTS.functions],
  ]) {
    await waitForHttp(url(port), label, EMULATOR_READY_TIMEOUT_MS, emulators)
  }

  const seedSummary = await seedTemplate()

  app = startViteProcess({ port: SANDBOX_PORTS.app, env: sandboxAppEnv })
  app.on('exit', (code) => {
    if (shuttingDown) return
    console.error(`\nThe Vite dev server exited (code ${code}). Shutting down.`)
    void shutdown(code ?? 1)
  })

  await waitForHttp(url(SANDBOX_PORTS.app), 'Vite dev server', APP_READY_TIMEOUT_MS, app)

  console.log(sandboxBanner(seedSummary, SANDBOX_PORTS))
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  await shutdown(1)
}
