// The port block, generated Firebase config and banner for `npm run demo:sandbox`.
//
// Kept out of `run-sandbox.mjs` because that module starts emulators the moment
// it is imported, and this is the part worth reading - and testing - on its own.

import { readFirebaseJson, resolveEmulatorPorts, withEmulatorPorts, writeFirebaseConfig } from '../emulators/ports.mjs'

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

/** Where the generated Firebase config lives, beside `firebase.json`. Ignored by git; see `.gitignore`. */
export const SANDBOX_CONFIG_FILE = 'firebase.sandbox.json'

/** Writes the sandbox's Firebase config into `root` and returns its path. */
export function writeSandboxConfig(root, resolved) {
  return writeFirebaseConfig(root, SANDBOX_CONFIG_FILE, sandboxConfig(readFirebaseJson(root), resolved))
}

/** What the rig prints once everything is up. */
export function sandboxBanner(seedSummary, ports) {
  const url = (port) => `http://127.0.0.1:${port}`
  return [
    '',
    '='.repeat(74),
    '  TABLE KEEP - HOSTED DEMO SANDBOX, RUNNING LOCALLY',
    '='.repeat(74),
    '',
    `  Start here       ${url(ports.app)}/demo`,
    `  Sign-in screen   ${url(ports.app)}   ("take a table for a few hours")`,
    `  Emulator UI      ${url(ports.ui)}`,
    '',
    `  ${seedSummary}`,
    '',
    '  Opening /demo signs you in anonymously and clones the template into a',
    '  campaign of your own, as its GM. Reload and you land back in the same',
    '  one. "Leave demo" signs out; opening /demo again builds a fresh sandbox',
    '  only once the old one has expired.',
    '',
    '  Everything is local. No Firebase project is contacted, and the committed',
    `  snapshot is only ever read. Ports: app ${ports.app}, emulators`,
    `  ${ports.auth}/${ports.firestore}/${ports.storage}/${ports.functions}.`,
    '',
    '  Press Ctrl+C to stop.',
    '='.repeat(74),
    '',
  ].join('\n')
}
