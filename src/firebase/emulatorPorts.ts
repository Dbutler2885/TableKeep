/**
 * The emulator ports the browser client connects to.
 *
 * Each checkout can run its emulators on a port block of its own (see
 * `scripts/emulators/ports.mjs`), so the ports cannot be literals here. Every
 * command that starts Vite against the emulators passes them in as
 * `VITE_*_EMULATOR_PORT`; a variable that is not set falls back to the
 * standard port in `firebase.json`.
 */
export const DEFAULT_EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
} as const

export type EmulatorPorts = Record<keyof typeof DEFAULT_EMULATOR_PORTS, number>

type EmulatorPortEnv = Partial<Record<
  'VITE_AUTH_EMULATOR_PORT' | 'VITE_FIRESTORE_EMULATOR_PORT' | 'VITE_STORAGE_EMULATOR_PORT' | 'VITE_FUNCTIONS_EMULATOR_PORT',
  string
>>

function port(env: EmulatorPortEnv, variable: keyof EmulatorPortEnv, fallback: number): number {
  const value = env[variable]
  if (value === undefined || value === '') return fallback

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    // A wrong port would connect the app to nothing, or to another checkout's
    // emulators, and look like an empty database. Say so instead.
    throw new Error(`[firebase] ${variable}=${value} is not a port number.`)
  }
  return parsed
}

export function emulatorPortsFromEnv(env: EmulatorPortEnv): EmulatorPorts {
  return {
    auth: port(env, 'VITE_AUTH_EMULATOR_PORT', DEFAULT_EMULATOR_PORTS.auth),
    firestore: port(env, 'VITE_FIRESTORE_EMULATOR_PORT', DEFAULT_EMULATOR_PORTS.firestore),
    storage: port(env, 'VITE_STORAGE_EMULATOR_PORT', DEFAULT_EMULATOR_PORTS.storage),
    functions: port(env, 'VITE_FUNCTIONS_EMULATOR_PORT', DEFAULT_EMULATOR_PORTS.functions),
  }
}
