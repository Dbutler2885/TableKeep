// Boots the Firebase emulators and the Vite dev server together for the
// demo campaign, in one of two deliberately different modes.
//
//   --mode=visitor  (npm run demo)
//     Imports ./emulator-data and never writes it back. A visitor gets the
//     committed campaign read-write in their own emulator, and the snapshot in
//     their checkout stays byte-for-byte pristine no matter what they do.
//
//   --mode=author   (npm run demo:author)
//     Imports ./emulator-data if it exists and exports back to it on exit.
//     This is the only command in the repository that overwrites the snapshot
//     on its own.
//
// Neither mode needs a real Firebase project, a login, or a hand-written
// `.env.local`: the placeholder web config in `.env.demo` is injected straight
// into the dev server's environment.

import { existsSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import process from 'node:process'
import {
  appPort,
  appUrl,
  authEmulatorUrl,
  demoAccounts,
  demoEmulators,
  demoEnv,
  demoSeatAccounts,
  emulatorUiUrl,
  firestoreEmulatorUrl,
  projectId,
  repoRoot,
  snapshotArg,
  snapshotDir,
  storageEmulatorUrl,
} from './config.mjs'
import { resolveJavaPath } from './java.mjs'
import { seedDemoAccounts, verifyDemoSignIn } from './seed-accounts.mjs'

const firebaseBin = new URL('../../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url)
const viteBin = new URL('../../node_modules/vite/bin/vite.js', import.meta.url)

const EMULATOR_READY_TIMEOUT_MS = 120_000
const APP_READY_TIMEOUT_MS = 60_000
const SHUTDOWN_GRACE_MS = 30_000

function parseMode() {
  const flag = process.argv.slice(2).find((arg) => arg.startsWith('--mode='))
  const mode = flag?.slice('--mode='.length)

  if (mode !== 'author' && mode !== 'visitor') {
    throw new Error('Pass --mode=author or --mode=visitor. Use "npm run demo" or "npm run demo:author".')
  }

  return mode
}

function hasSnapshot() {
  return existsSync(snapshotDir) && readdirSync(snapshotDir).length > 0
}

function startEmulators(mode, javaPath) {
  const args = [
    'emulators:start',
    '--only', demoEmulators,
    '--project', projectId,
  ]

  if (hasSnapshot()) {
    args.push(`--import=${snapshotArg}`)
  }

  if (mode === 'author') {
    args.push(`--export-on-exit=${snapshotArg}`)
  }

  // Detached so an interactive Ctrl+C does not reach the Firebase CLI through
  // the terminal's process group. This process owns the shutdown order, and in
  // author mode a second signal arriving mid-export would abandon the export.
  return spawn(process.execPath, [firebaseBin.pathname, ...args], {
    cwd: repoRoot,
    detached: true,
    env: { ...process.env, PATH: javaPath },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
}

function startApp() {
  return spawn(
    process.execPath,
    [viteBin.pathname, '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'],
    {
      cwd: repoRoot,
      detached: true,
      // Vite lets `process.env` win over every `.env` file, so injecting the
      // demo config here beats any real `.env.local` the machine already has.
      env: { ...process.env, ...demoEnv },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )
}

async function waitForHttp(url, label, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready (code ${child.exitCode}).`)
    }

    try {
      await fetch(url)
      return
    } catch {
      // Not listening yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`${label} was not ready at ${url} within ${Math.round(timeoutMs / 1000)} seconds.`)
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

function banner(mode) {
  const lines = [
    '',
    '='.repeat(72),
    mode === 'author'
      ? '  TABLE KEEP DEMO - AUTHORING MODE'
      : '  TABLE KEEP DEMO - VISITOR MODE',
    '='.repeat(72),
    '',
    `  App                ${appUrl}`,
  ]

  if (emulatorUiUrl) {
    lines.push(`  Emulator UI        ${emulatorUiUrl}`)
  }

  // Only the two seats, matching the sign-in screen. The rest of the party is
  // seeded so the campaign's characters have owners, not so a visitor logs in
  // as each of them.
  lines.push('', '  Sign in with either seeded account (local emulator only):', '')

  for (const account of demoSeatAccounts) {
    lines.push(`    ${account.role.padEnd(12)} ${account.email}  /  ${account.password}`)
  }

  lines.push('')

  if (mode === 'author') {
    lines.push(
      `  ON EXIT THIS OVERWRITES ${snapshotArg}.`,
      '  Everything you build here is saved to the committed snapshot when you',
      '  press Ctrl+C. To save without quitting, run "npm run demo:save" in',
      '  another terminal. Check the size with "npm run demo:size" before you',
      '  commit.',
    )
  } else {
    lines.push(
      `  ${snapshotArg} IS READ-ONLY HERE.`,
      '  Everything is loaded into your own local emulator, so change whatever',
      '  you like - the committed snapshot in your checkout is never written',
      '  back to. Restart this command to get the original campaign again.',
    )
  }

  lines.push('', '  Press Ctrl+C to stop.', '='.repeat(72), '')

  return lines.join('\n')
}

function preflight() {
  const mode = parseMode()

  if (mode === 'visitor' && !hasSnapshot()) {
    throw new Error(
      `No demo snapshot found at ${snapshotArg}.\n`
      + 'The demo campaign has not been authored and committed yet. Build one with "npm run demo:author".',
    )
  }

  return { mode, javaPath: resolveJavaPath() }
}

let mode
let javaPath

try {
  ({ mode, javaPath } = preflight())
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const emulators = startEmulators(mode, javaPath)
let app = null
let shuttingDown = false

async function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true

  if (app) {
    await stopChild(app, 'SIGTERM', 5_000)
  }

  // SIGINT, not SIGTERM: the Firebase CLI's SIGINT handler is what runs the
  // export-on-exit in author mode.
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
  for (const [label, url] of [
    ['Auth emulator', authEmulatorUrl],
    ['Firestore emulator', firestoreEmulatorUrl],
    ['Storage emulator', storageEmulatorUrl],
  ]) {
    await waitForHttp(url, label, EMULATOR_READY_TIMEOUT_MS, emulators)
  }

  for (const summary of await seedDemoAccounts()) {
    console.log(`demo account ${summary}`)
  }

  for (const account of demoAccounts) {
    await verifyDemoSignIn(account)
  }

  app = startApp()
  app.on('exit', (code) => {
    if (shuttingDown) return
    console.error(
      `\nThe Vite dev server exited (code ${code}). Shutting down.\n`
      + `If port ${appPort} is already in use, set DEMO_APP_PORT to a free port and run the command again.`,
    )
    void shutdown(code ?? 1)
  })

  await waitForHttp(appUrl, 'Vite dev server', APP_READY_TIMEOUT_MS, app)

  console.log(banner(mode))
} catch (error) {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`)
  await shutdown(1)
}
