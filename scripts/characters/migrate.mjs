// Brings every character up to its rule set's current schemaVersion, with the
// rule sets' own migration steps. The runbook for a schema change is in AGENTS.md.
//
//   node scripts/characters/migrate.mjs                              (dry run: counts only, writes nothing)
//   node scripts/characters/migrate.mjs --apply                      (migrates every character that needs it)
//   ... --live --project <id>                                        (a real project instead of the emulator)
//
// With FIRESTORE_EMULATOR_HOST set it talks to the emulator. A real project has
// to be named with --live and --project, and uses your gcloud login.
// It prints counts and document paths only, never a name or sheet text, and
// exits with a failure when any document is flagged.
// Install the Cloud Functions package first: firebase-admin comes from there.

import { createRequire } from 'node:module'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { migrationTarget } from './plan.mjs'
import { createReport, formatCounts, formatSummary, formatWritten, recordCampaign, recordCharacter } from './report.mjs'
import { migrateStoredCharacter, planStoredCharacter, walkCharacters } from './run.mjs'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { values } = parseArgs({
  options: { apply: { type: 'boolean' }, live: { type: 'boolean' }, project: { type: 'string' } },
})
const target = migrationTarget(values, process.env)

const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const db = getFirestore(initializeApp(target.projectId ? { projectId: target.projectId } : undefined))

console.log(`Character migration against ${target.label}: ${values.apply ? 'write run' : 'dry run, nothing will be written'}.`)
const report = createReport()
await walkCharacters(db, {
  visit: values.apply ? (snapshot, ruleSetId) => migrateStoredCharacter(db, snapshot.ref, ruleSetId) : planStoredCharacter,
  onCampaign: (campaign) => recordCampaign(report, campaign.ref.path, campaign.implicit),
  onCharacter: (path, plan) => {
    recordCharacter(report, path, plan)
    if (values.apply && plan.status === 'migrate') console.log(formatWritten(path, plan))
  },
})
console.log(formatCounts(report, values.apply))
console.log(formatSummary(report, values.apply))
if (report.flagged.length) process.exitCode = 1
