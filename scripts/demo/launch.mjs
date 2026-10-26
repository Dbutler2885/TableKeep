// Starting the Firebase emulators and the Vite dev server for the demo rigs.
//
// Kept out of `run.mjs` and `run-sandbox.mjs` because those modules start
// emulators the moment they are imported; this is the part that decides what
// the children are started with, and it is tested on its own.

import { spawn as nodeSpawn } from 'node:child_process'
import process from 'node:process'
import { demoEmulators, projectId, repoRoot, snapshotArg } from './config.mjs'
import { firebaseConfigArgs, firebaseEnv } from '../emulators/ports.mjs'

const firebaseBin = new URL('../../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url)
const viteBin = new URL('../../node_modules/vite/bin/vite.js', import.meta.url)

/**
 * The `firebase` arguments for `npm run demo` (`visitor`) or
 * `npm run demo:author` (`author`), on this checkout's ports.
 */
export function demoEmulatorArgs({ mode, hasSnapshot, resolved, root = repoRoot }) {
  return [
    ...firebaseConfigArgs(resolved, root),
    'emulators:start',
    '--only', demoEmulators,
    '--project', projectId,
    ...(hasSnapshot ? [`--import=${snapshotArg}`] : []),
    ...(mode === 'author' ? [`--export-on-exit=${snapshotArg}`] : []),
  ]
}

/**
 * Starts firebase-tools with `args`, on the JDK in `javaPath` and this
 * checkout's ports and temporary directory.
 *
 * Detached so an interactive Ctrl+C does not reach the Firebase CLI through
 * the terminal's process group. The rig owns the shutdown order, and in author
 * mode a second signal arriving mid-export would abandon the export.
 */
export function startEmulatorProcess({ args, javaPath, resolved, root = repoRoot, spawn = nodeSpawn }) {
  return spawn(process.execPath, [firebaseBin.pathname, ...args], {
    cwd: root,
    detached: true,
    env: firebaseEnv(resolved, { ...process.env, PATH: javaPath }),
    stdio: ['ignore', 'inherit', 'inherit'],
  })
}

/**
 * Starts the Vite dev server on `port` with `env` on top of this process's
 * environment. Detached for the same reason as the emulators.
 *
 * Vite lets `process.env` win over every `.env` file, so injecting the demo
 * config this way beats any real `.env.local` the machine already has.
 */
export function startViteProcess({ port, env, root = repoRoot, spawn = nodeSpawn }) {
  return spawn(
    process.execPath,
    [viteBin.pathname, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: root,
      detached: true,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  )
}
