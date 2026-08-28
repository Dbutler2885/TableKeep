// The port block and generated Firebase config for `npm run demo:sandbox`.
//
// Kept out of `run-sandbox.mjs` because that module starts emulators the moment
// it is imported, and this is the part worth reading - and testing - on its own.

/**
 * A port block of its own, deliberately nowhere near `firebase.json`'s.
 *
 * The default block belongs to `npm run demo`, `npm run test:emulator`, and
 * every other checkout on the machine. The sandbox rig is a long-running thing
 * somebody leaves open while they click around, so it must not be the reason
 * another worktree's emulators refuse to start.
 *
 * `firestoreWebsocket` is pinned for the same reason: left alone, the Firestore
 * emulator picks 9150, which is the one port the default block claims that
 * `firebase.json` never mentions.
 */
export const SANDBOX_PORTS = {
  hub: 4491,
  logging: 4591,
  ui: 4091,
  auth: 9591,
  firestore: 8581,
  firestoreWebsocket: 9251,
  storage: 9691,
  functions: 5591,
  app: 5185,
}

/** The emulators the sandbox rig starts. Unlike `npm run demo`, functions is one of them. */
export const SANDBOX_EMULATORS = 'auth,firestore,storage,functions'

/**
 * `firebase.json` with a different port block.
 *
 * Generated at run time rather than committed so the rules paths, the functions
 * source and the hosting config keep exactly one definition. The generated file
 * has to land in the repository root, because firebase-tools resolves every
 * relative path in a config - and the project root itself - from the config
 * file's own directory.
 */
export function sandboxConfig(baseConfig, ports = SANDBOX_PORTS) {
  return {
    ...baseConfig,
    emulators: {
      hub: { port: ports.hub },
      logging: { port: ports.logging },
      auth: { port: ports.auth },
      firestore: { port: ports.firestore, websocketPort: ports.firestoreWebsocket },
      storage: { port: ports.storage },
      functions: { port: ports.functions },
      ui: { enabled: true, port: ports.ui },
      singleProjectMode: true,
    },
  }
}
