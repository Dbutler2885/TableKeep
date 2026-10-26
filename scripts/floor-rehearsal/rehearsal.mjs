// What `npm run rehearse:floors` generates and runs, kept apart from `run.mjs`
// because that module starts emulators the moment it is imported, and this is
// the part worth testing on its own.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { withCharacterSchemaFloors } from './floors.mjs'
import { withEmulatorPorts } from '../emulators/ports.mjs'

/**
 * The generated files. Both are ignored by git, and both land in the
 * repository root, because firebase-tools resolves a config's relative paths
 * from the config file's own directory.
 */
export const REHEARSAL_RULES_FILE = 'firestore.rehearsal.rules'
export const REHEARSAL_CONFIG_FILE = 'firebase.rehearsal.json'

/** The two CI jobs the rehearsal reruns, by the npm script each one runs. */
export const REHEARSAL_JOBS = {
  emulator: 'test:emulator',
  smoke: 'test:browser-smoke',
}

/** `firestore.rules` with every rule set's floor raised to the version the app writes. */
export function raisedFloorRules(rulesText, currentVersions) {
  return withCharacterSchemaFloors(rulesText, currentVersions)
}

/**
 * `firebase.json` with the emulators loading the raised rules instead, on this
 * checkout's port block when it has one (see `scripts/emulators/ports.mjs`).
 */
export function rehearsalConfig(baseConfig, resolvedPorts = { base: null }) {
  const config = resolvedPorts.base === null ? baseConfig : withEmulatorPorts(baseConfig, resolvedPorts.ports)
  return { ...config, firestore: { ...config.firestore, rules: REHEARSAL_RULES_FILE } }
}

const EMULATORS_EXEC = /^node scripts\/emulators\/firebase\.mjs emulators:exec --only (\S+) "(.+)"$/

/**
 * The `firebase` arguments that rerun one job against the generated config.
 * They are read off the job's own npm script, so the rehearsal starts the same
 * emulators and runs the same command as CI does.
 */
export function rehearsalJobArgs(packageScripts, job) {
  const script = packageScripts[REHEARSAL_JOBS[job]]
  const match = EMULATORS_EXEC.exec(script ?? '')
  if (!match) throw new Error(`npm script ${REHEARSAL_JOBS[job]} is not a firebase emulators:exec command: ${script}`)
  return ['emulators:exec', '--config', REHEARSAL_CONFIG_FILE, '--only', match[1], match[2]]
}

/** The jobs named by `--job=<name>`, or both when none is named. */
export function selectedJobs(argv) {
  const flag = argv.find((arg) => arg.startsWith('--job='))
  if (!flag) return Object.keys(REHEARSAL_JOBS)
  const job = flag.slice('--job='.length)
  if (!Object.hasOwn(REHEARSAL_JOBS, job)) throw new Error(`Unknown job "${job}". Use one of: ${Object.keys(REHEARSAL_JOBS).join(', ')}.`)
  return [job]
}

/** Writes the raised rules and the config that loads them into `root`. */
export function writeRehearsalFiles(root, currentVersions, resolvedPorts) {
  const read = (file) => readFileSync(path.join(root, file), 'utf8')
  writeFileSync(path.join(root, REHEARSAL_RULES_FILE), raisedFloorRules(read('firestore.rules'), currentVersions))
  const config = rehearsalConfig(JSON.parse(read('firebase.json')), resolvedPorts)
  writeFileSync(path.join(root, REHEARSAL_CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`)
}

/**
 * Runs one job's `firebase` command with `spawn` (`spawnSync`'s signature),
 * from `root`, with the emulator suites pointed at the raised rules, and
 * returns its exit status.
 */
export function runRehearsalJob(job, { scripts, env, root, firebaseBin, spawn }) {
  const result = spawn(process.execPath, [firebaseBin, ...rehearsalJobArgs(scripts, job)], {
    cwd: root,
    env: { ...env, FIRESTORE_RULES_FILE: REHEARSAL_RULES_FILE },
    stdio: 'inherit',
  })
  return result.status ?? 1
}
