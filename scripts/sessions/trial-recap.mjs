// Writes a recap for one archived session with the new recap writer and puts
// it beside the recap on record, without touching any real campaign.
//
//   firebase emulators:exec --only firestore "node scripts/sessions/trial-recap.mjs \
//       --from ~/Roleplaying-Transcripts --group 'Home Boys' --folder 17 --out <folder> [--model gpt-5.6-sol]"
//
// It runs against the Firestore emulator and calls the real model, so it needs
// OPENAI_API_KEY and costs what one recap costs. The output folder holds the
// group's real session content: keep it out of the repository.

import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { callOpenAi, writeSessionRecap } from '../../functions/lib/recap/writeRecap.js'
import { legacyRecapAsSummary, readLegacyFolder, readLegacySession } from './legacyFolder.mjs'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    group: { type: 'string' },
    folder: { type: 'string' },
    out: { type: 'string' },
    model: { type: 'string' },
    effort: { type: 'string' },
  },
})
if (!values.from || !values.group || !values.folder || !values.out) {
  throw new Error('Needs --from <folder> --group <name> --folder <number> --out <folder>.')
}
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run this under the Firestore emulator; it must never write to a real project.')
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set.')

const group = readLegacyFolder(values.from).groups.find((candidate) => candidate.name === values.group)
if (!group) throw new Error(`The old config has no group called ${values.group}.`)
const folderNumber = Number(values.folder)
const sessionNumber = folderNumber - group.sessionOffset
const archived = readLegacySession(values.from, values.group, folderNumber)
if (!archived.transcript) throw new Error(`No transcript for ${values.group} folder ${folderNumber}.`)
const before = readLegacySession(values.from, values.group, folderNumber - 1)

const { initializeApp } = require('firebase-admin/app')
const { getFirestore, Timestamp } = require('firebase-admin/firestore')
const db = getFirestore(initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev' }))

const session = { groupId: 'trial-recap-group', campaignId: 'trial-recap-campaign', sessionId: `folder-${folderNumber}` }
const campaign = db.doc(`groups/${session.groupId}/campaigns/${session.campaignId}`)
await db.recursiveDelete(db.doc(`groups/${session.groupId}`))
await campaign.collection('recapSettings').doc('main').set(group.settings)
await campaign.collection('sessions').doc(session.sessionId).set({ number: sessionNumber, state: 'ended', transcriptRevision: 'live' })
if (before.recap) {
  await campaign.collection('sessionSummaries').doc('previous').set({ ...legacyRecapAsSummary(before.recap, sessionNumber - 1), createdAt: Timestamp.now() })
}

const overrides = { ...(values.model ? { model: values.model } : {}), ...(values.effort ? { reasoningEffort: values.effort } : {}) }
console.log(`Writing a recap for ${values.group} session ${sessionNumber} with ${overrides.model ?? group.settings.model}...`)
const { summaryId } = await writeSessionRecap(
  db,
  session,
  { callModel: callOpenAi(process.env.OPENAI_API_KEY), readTranscript: async () => archived.transcript },
  { overrides },
)
const written = (await campaign.collection('sessionSummaries').doc(summaryId).get()).data()

mkdirSync(values.out, { recursive: true })
writeFileSync(path.join(values.out, 'new-recap.json'), JSON.stringify(written, null, 2))
if (archived.recap) writeFileSync(path.join(values.out, 'recap-on-record.json'), JSON.stringify(archived.recap, null, 2))

const words = (text) => String(text ?? '').split(/\s+/).filter(Boolean).length
const onRecord = archived.recap ? legacyRecapAsSummary(archived.recap, sessionNumber) : null
const row = (label, pick) => console.log(`  ${label.padEnd(26)} ${String(pick(written)).padEnd(24)} ${onRecord ? pick(onRecord) : ''}`)
console.log(`\n  ${''.padEnd(26)} ${'new'.padEnd(24)} on record`)
row('summary, words', (recap) => words(recap.overallSummary))
row('scenes', (recap) => recap.scenes.length)
row('scene details', (recap) => recap.scenes.reduce((sum, scene) => sum + scene.details.length, 0))
row('NPCs', (recap) => recap.npcMentions.length)
row('cliffhangers', (recap) => recap.cliffhangers.length)
row('calendar days', (recap) => recap.calendar.map((day) => day.key).join(' '))
row('calendar entries', (recap) => recap.calendar.reduce((sum, day) => sum + day.entries.length, 0))
const names = (recap) => new Set(recap.npcMentions.map((npc) => npc.name.toLowerCase()))
if (onRecord) {
  const shared = [...names(written)].filter((name) => names(onRecord).has(name)).length
  console.log(`  ${'NPC names in common'.padEnd(26)} ${shared} of ${names(written).size} new, ${names(onRecord).size} on record`)
}
console.log(`\n  model ${written.generation.model} (${written.generation.reasoningEffort}), ${written.generation.elapsedSeconds}s, usage ${JSON.stringify(written.generation.usage)}`)
if (archived.recapMeta) console.log(`  on record: ${archived.recapMeta.model} (${archived.recapMeta.reasoning_effort}), ${archived.recapMeta.elapsed_seconds}s`)
console.log(`\nBoth recaps are in ${values.out}`)
