// Shared configuration for the demo-authoring harness.
//
// Everything the demo path needs is derived from files that are already
// committed - `.env.demo` for the placeholder Firebase web config and the two
// demo account logins, and `firebase.json` for the emulator ports - so they
// never drift apart.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

export const demoEnvPath = path.join(repoRoot, '.env.demo')
export const snapshotDir = path.join(repoRoot, 'emulator-data')

/** The snapshot path as the Firebase CLI and the docs spell it. */
export const snapshotArg = './emulator-data'

/**
 * Practical ceiling for the committed snapshot, in bytes.
 *
 * The snapshot carries every Storage object the demo campaign uses - map
 * images and portraits - and git keeps every version of them forever. A
 * reviewer should be able to clone the repository on a hotel connection, so
 * treat this as a hard budget rather than a suggestion.
 */
export const snapshotSizeLimitBytes = 25 * 1024 * 1024

/** Per-file ceiling inside the snapshot, in bytes. */
export const snapshotFileSizeLimitBytes = 1024 * 1024

function parseEnvFile(contents) {
  const values = {}

  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    const separator = line.indexOf('=')
    if (separator === -1) continue

    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }

  return values
}

function readDemoEnv() {
  let contents
  try {
    contents = readFileSync(demoEnvPath, 'utf8')
  } catch {
    throw new Error(
      `Missing ${demoEnvPath}. It is committed to this repository; restore it with "git checkout -- .env.demo".`,
    )
  }

  const values = parseEnvFile(contents)
  const required = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_USE_FIREBASE_EMULATORS',
    'VITE_DEMO_GM_EMAIL',
    'VITE_DEMO_GM_PASSWORD',
    'VITE_DEMO_PLAYER_EMAIL',
    'VITE_DEMO_PLAYER_PASSWORD',
  ]
  const missing = required.filter((key) => !values[key])

  if (missing.length > 0) {
    throw new Error(`${demoEnvPath} is missing required keys: ${missing.join(', ')}`)
  }

  return values
}

/** The placeholder `VITE_*` values injected into the demo dev server. */
export const demoEnv = readDemoEnv()

export const projectId = demoEnv.VITE_FIREBASE_PROJECT_ID
export const apiKey = demoEnv.VITE_FIREBASE_API_KEY

const firebaseJson = JSON.parse(readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'))
const emulatorPorts = firebaseJson.emulators ?? {}

export const authEmulatorUrl = `http://127.0.0.1:${emulatorPorts.auth.port}`
export const firestoreEmulatorUrl = `http://127.0.0.1:${emulatorPorts.firestore.port}`
export const storageEmulatorUrl = `http://127.0.0.1:${emulatorPorts.storage.port}`
export const emulatorUiUrl = emulatorPorts.ui?.enabled
  ? `http://127.0.0.1:${emulatorPorts.ui.port}`
  : null

/** The emulators the demo harness starts. The functions emulator is not one of them. */
export const demoEmulators = 'auth,firestore,storage'

export const appPort = Number(process.env.DEMO_APP_PORT ?? 5173)
export const appUrl = `http://127.0.0.1:${appPort}`

/**
 * The two seeded demo accounts.
 *
 * The email and password are read from `.env.demo` rather than written here,
 * because the sign-in screen needs the same pair: `startApp` in `run.mjs`
 * injects every `VITE_*` value from that file into the demo dev server, and
 * `src/features/auth/demoSeats.ts` turns `VITE_DEMO_*` into the one-click seat
 * buttons a visitor sees. One definition, seeded and offered from the same
 * line. A normal `npm run build` never loads `.env.demo`, so those seats do not
 * exist in a production bundle.
 *
 * The uids are pinned rather than generated. The committed snapshot stores
 * campaign ownership, group membership and character ownership by uid, so a
 * re-seed on a visitor's machine has to land on the same uids or the imported
 * campaign would belong to nobody.
 *
 * Usernames must be exactly seven characters (see `src/features/auth/usernameRules.ts`).
 *
 * These are demo credentials for a local emulator that never reaches a real
 * project. They are meant to be public and documented.
 */
export const demoAccounts = [
  {
    uid: 'demo-gm-uid',
    role: 'Game Master',
    email: demoEnv.VITE_DEMO_GM_EMAIL,
    password: demoEnv.VITE_DEMO_GM_PASSWORD,
    username: 'demoGM1',
    displayName: 'Demo GM',
  },
  {
    uid: 'demo-player-uid',
    role: 'Player',
    email: demoEnv.VITE_DEMO_PLAYER_EMAIL,
    password: demoEnv.VITE_DEMO_PLAYER_PASSWORD,
    username: 'demoPC1',
    displayName: 'Demo Player',
  },
]
