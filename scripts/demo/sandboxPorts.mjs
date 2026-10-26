// The port block and generated Firebase config for `npm run demo:sandbox`.
//
// Kept out of `run-sandbox.mjs` because that module starts emulators the moment
// it is imported, and this is the part worth reading - and testing - on its own.

import { resolveEmulatorPorts, withEmulatorPorts } from '../emulators/ports.mjs'

/**
 * The rig's ports: this checkout's emulator ports (see
 * `scripts/emulators/ports.mjs`), and its own dev server port.
 *
 * The emulators are the same ones `npm run demo` uses, so the two rigs cannot
 * run in one checkout at once. The dev server moves, because nothing points at
 * it but the address bar and it is the port most likely to be taken: 5173 is
 * every Vite project's default and `npm run demo` already claims it.
 */
export function sandboxPorts(resolved = resolveEmulatorPorts()) {
  const { ports } = resolved
  return {
    auth: ports.auth,
    firestore: ports.firestore,
    storage: ports.storage,
    functions: ports.functions,
    ui: ports.ui,
    app: ports.sandboxApp,
  }
}

/** The emulators the sandbox rig starts. Unlike `npm run demo`, functions is one of them. */
export const SANDBOX_EMULATORS = 'auth,firestore,storage,functions'

/**
 * `firebase.json` with this checkout's ports, and the functions emulator and
 * the UI turned on.
 *
 * Generated at run time rather than committed so the rules paths, the functions
 * source and the hosting config keep exactly one definition. The generated file
 * has to land in the repository root, because firebase-tools resolves every
 * relative path in a config - and the project root itself - from the config
 * file's own directory.
 */
export function sandboxConfig(baseConfig, resolved = resolveEmulatorPorts()) {
  const config = withEmulatorPorts(baseConfig, resolved.ports)
  return {
    ...config,
    emulators: {
      ...config.emulators,
      functions: { ...config.emulators.functions, port: resolved.ports.functions },
      ui: { ...config.emulators.ui, enabled: true, port: resolved.ports.ui },
      singleProjectMode: true,
    },
  }
}
