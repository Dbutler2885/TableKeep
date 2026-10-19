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

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { repoRoot } from '../demo/config.mjs'
import { resolveJavaPath } from '../demo/java.mjs'
import { currentCharacterSchemaVersions } from './currentVersions.mjs'
import { REHEARSAL_RULES_FILE, runRehearsalJob, selectedJobs, writeRehearsalFiles } from './rehearsal.mjs'

const firebaseBin = new URL('../../node_modules/firebase-tools/lib/bin/firebase.js', import.meta.url)

const jobs = selectedJobs(process.argv.slice(2))
const { scripts } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
writeRehearsalFiles(repoRoot, currentCharacterSchemaVersions)
console.log(`Floors raised to ${JSON.stringify(currentCharacterSchemaVersions)} in ${REHEARSAL_RULES_FILE}.`)

const env = { ...process.env, PATH: resolveJavaPath() }
const spawnFirebase = (args, jobEnv) =>
  spawnSync(process.execPath, [firebaseBin.pathname, ...args], { cwd: repoRoot, env: jobEnv, stdio: 'inherit' })

const outcomes = jobs.map((job) => {
  console.log(`\n== Raised-floor rehearsal: ${job} ==\n`)
  return [job, runRehearsalJob(job, scripts, env, spawnFirebase)]
})
for (const [job, status] of outcomes) console.log(`${job}: ${status === 0 ? 'passed' : `failed (exit ${status})`}`)
process.exitCode = outcomes.every(([, status]) => status === 0) ? 0 : 1
