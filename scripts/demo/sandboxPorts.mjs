// The port block and generated Firebase config for `npm run demo:sandbox`.
//
// Kept out of `run-sandbox.mjs` because that module starts emulators the moment
// it is imported, and this is the part worth reading - and testing - on its own.

/**
 * The emulator ports, which are `firebase.json`'s and cannot be anything else.
 *
 * This block started out shifted, so the rig could sit alongside another
 * checkout's emulators. It cannot: `src/firebase/index.ts` connects the browser
 * SDK to 9099 / 8080 / 5001 / 9199 as literals, so an emulator on any other port
 * is one the app cannot reach, and the first thing a visitor meets is
 * ERR_CONNECTION_REFUSED on the sandbox callable.
 *
 * Only the dev server moves. That one is safe to move because nothing points at
 * it but the address bar, and it is the port most likely to be taken - 5173 is
 * every Vite project's default, `npm run demo` already claims it, and this rig
 * is a long-running thing somebody leaves open.
 *
 * Making the emulator ports configurable means teaching the client to read them
 * from `VITE_*`; until that happens, running this rig and another checkout's
 * emulators at the same time is not possible, and it should fail loudly on a
 * port clash rather than quietly connect the app to the wrong emulator.
 */
export const SANDBOX_PORTS = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
  functions: 5001,
  ui: 4000,
  app: 5185,
}

/** The emulators the sandbox rig starts. Unlike `npm run demo`, functions is one of them. */
export const SANDBOX_EMULATORS = 'auth,firestore,storage,functions'

/**
 * `firebase.json` with the functions emulator and the UI turned on.
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
      ...baseConfig.emulators,
      auth: { port: ports.auth },
      firestore: { port: ports.firestore },
      storage: { port: ports.storage },
      functions: { port: ports.functions },
      ui: { enabled: true, port: ports.ui },
      singleProjectMode: true,
    },
  }
}
