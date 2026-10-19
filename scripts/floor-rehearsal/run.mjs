// Reruns the emulator job and the browser smoke with every character schema
// floor raised to the version its rule set writes (Spec A 5.8).
//
//   npm run rehearse:floors                  both jobs
//   npm run rehearse:floors -- --job=emulator
//   npm run rehearse:floors -- --job=smoke
//
// This is the check before a floor goes up in production: code that writes the
// current version passes, and anything that does not is refused, exactly as it
// would be once the raised rules are deployed. It generates a raised copy of
// `firestore.rules` and a `firebase.json` that loads it, as `npm run
// demo:sandbox` generates its config, and points the emulator suites at the
// copy through `FIRESTORE_RULES_FILE`. `firestore.rules` itself is only read.
//
// Nothing here reaches a real Firebase project: it runs the same
// `firebase emulators:exec` commands as CI.

import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { repoRoot } from '../demo/config.mjs'
import { resolveJavaPath } from '../demo/java.mjs'
import { currentCharacterSchemaVersions } from './currentVersions.mjs'
import {
  REHEARSAL_CONFIG_FILE,
  REHEARSAL_RULES_FILE,
  raisedFloorRules,
  rehearsalConfig,
  rehearsalJobArgs,
  selectedJobs,
} from './rehearsal.mjs'

const firebaseBin = new URL('../../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url)

const readRepoFile = (file) => readFileSync(path.join(repoRoot, file), 'utf8')

function writeGeneratedFiles() {
  writeFileSync(path.join(repoRoot, REHEARSAL_RULES_FILE), raisedFloorRules(readRepoFile('firestore.rules'), currentCharacterSchemaVersions))
  const config = rehearsalConfig(JSON.parse(readRepoFile('firebase.json')))
  writeFileSync(path.join(repoRoot, REHEARSAL_CONFIG_FILE), `${JSON.stringify(config, null, 2)}\n`)
}

function runJob(job, scripts, javaPath) {
  console.log(`\n== Raised-floor rehearsal: ${job} ==\n`)
  const result = spawnSync(process.execPath, [firebaseBin.pathname, ...rehearsalJobArgs(scripts, job)], {
    cwd: repoRoot,
    env: { ...process.env, PATH: javaPath, FIRESTORE_RULES_FILE: REHEARSAL_RULES_FILE },
    stdio: 'inherit',
  })
  return result.status ?? 1
}

const jobs = selectedJobs(process.argv.slice(2))
const scripts = JSON.parse(readRepoFile('package.json')).scripts
writeGeneratedFiles()
console.log(`Floors raised to ${JSON.stringify(currentCharacterSchemaVersions)} in ${REHEARSAL_RULES_FILE}.`)

const javaPath = resolveJavaPath()
const outcomes = jobs.map((job) => [job, runJob(job, scripts, javaPath)])
for (const [job, status] of outcomes) console.log(`${job}: ${status === 0 ? 'passed' : `failed (exit ${status})`}`)
process.exitCode = outcomes.every(([, status]) => status === 0) ? 0 : 1
