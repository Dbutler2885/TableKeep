// Copies each campaign's recap settings from the old drop-folder pipeline's
// files onto the campaign.
//
//   node scripts/sessions/seed-recap-settings.mjs --from ~/Roleplaying-Transcripts            (says what it would write)
//   node scripts/sessions/seed-recap-settings.mjs --from ~/Roleplaying-Transcripts --apply    (writes to the emulator)
//   ... --apply --live --project <id>                                                         (writes to a real project)
//
// With FIRESTORE_EMULATOR_HOST set it writes to the emulator. Writing to a real
// project has to be asked for by name with --live, and uses your gcloud login.
// Run `npm run build --prefix functions` first: this reads the compiled settings code.

import { createRequire } from 'node:module'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { readLegacyFolder } from './legacyFolder.mjs'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { values } = parseArgs({
  options: { from: { type: 'string' }, apply: { type: 'boolean' }, live: { type: 'boolean' }, project: { type: 'string' } },
})
if (!values.from) throw new Error('Say where the old pipeline lives with --from <folder>.')

const { groups } = readLegacyFolder(values.from)
for (const group of groups) {
  const { settings } = group
  console.log(`${group.name}`)
  console.log(`  campaign       groups/${group.groupId}/campaigns/${group.campaignId}`)
  console.log(`  model          ${settings.model} at ${settings.reasoningEffort} effort`)
  console.log(`  style          ${settings.style}; sections: ${settings.sections.join(', ')}`)
  console.log(`  prompt         ${settings.promptHeader ? `its own (${settings.promptHeader.length} characters)` : 'the default'}`)
  console.log(`  glossary       GM ${settings.glossary.gm ?? '(none)'}, ${Object.keys(settings.glossary.players ?? {}).length} players, ${Object.keys(settings.glossary.corrections ?? {}).length} corrections`)
}

if (!values.apply) {
  console.log('\nNothing written. Add --apply to write these.')
  process.exit(0)
}

const emulator = process.env.FIRESTORE_EMULATOR_HOST
if (!emulator && !values.live) {
  throw new Error('No emulator is running (FIRESTORE_EMULATOR_HOST is not set). To write to a real project, add --live.')
}
if (emulator && values.live) throw new Error('--live was given but FIRESTORE_EMULATOR_HOST is set. Unset one of them.')

const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const db = getFirestore(initializeApp(values.project ? { projectId: values.project } : undefined))

for (const group of groups) {
  if (!group.groupId || !group.campaignId) {
    console.log(`Skipped ${group.name}: the old config names no group or campaign for it.`)
    continue
  }
  await db.doc(`groups/${group.groupId}/campaigns/${group.campaignId}/recapSettings/main`).set(group.settings)
  console.log(`Wrote ${group.name} to ${emulator ? `the emulator at ${emulator}` : 'the live project'}.`)
}
