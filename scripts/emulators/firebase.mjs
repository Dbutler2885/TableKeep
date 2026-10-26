// Runs firebase-tools on this checkout's emulator ports.
//
//   node scripts/emulators/firebase.mjs emulators:exec --only firestore,storage "vitest run ..."
//
// Every npm script that starts or talks to the emulators goes through here
// instead of calling `firebase` directly. The arguments are firebase-tools'
// own; this adds three things, all decided by `ports.mjs`:
//
//   - On a port block other than the standard one, it generates
//     `firebase.ports.json` and passes `--config` for it, so the emulators
//     listen on this checkout's ports. On the standard ports it passes nothing
//     and firebase-tools reads `firebase.json` exactly as it always has, which
//     is what CI does.
//   - It puts the `VITE_*_EMULATOR_PORT` variables in the environment, so a
//     Vite server started inside `emulators:exec` connects the browser client
//     to the same ports.
//   - On a port block, it gives firebase-tools a temporary directory of the
//     block's own, so this checkout's Storage blobs and hub locator are not
//     shared with, or deleted by, another checkout's emulators. That is also
//     what lets `emulators:export` (`npm run demo:save`) find this checkout's
//     emulators rather than another's. See `blockTempDir`.

import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import {
  assertBlockIsFree,
  describeEmulatorPorts,
  firebaseConfigArgs,
  firebaseEnv,
  repoRoot,
  resolveEmulatorPorts,
} from './ports.mjs'

const firebaseBin = path.join(repoRoot, 'node_modules/firebase-tools/lib/bin/firebase.js')

function runFirebase(args, resolved) {
  const configArgs = firebaseConfigArgs(resolved)
  const child = spawn(process.execPath, [firebaseBin, ...configArgs, ...args], {
    env: firebaseEnv(resolved),
    stdio: 'inherit',
  })

  // Pass signals on and wait for firebase-tools to stop its emulators, as npm
  // does for the scripts it runs. Exiting first would orphan them.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal))
  }

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0))
  })
}

async function main(args) {
  const resolved = resolveEmulatorPorts()
  const starts = args[0] === 'emulators:exec' || args[0] === 'emulators:start'

  if (starts) {
    console.error(describeEmulatorPorts(resolved))
    await assertBlockIsFree(resolved)
  }
  runFirebase(args, resolved)
}

try {
  await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
