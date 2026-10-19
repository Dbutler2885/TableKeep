/**
 * The character migration script, run for real: the actual CLI as a child
 * process, against a live Firestore emulator seeded with the checked-in
 * character fixtures.
 *
 * The script and this suite's admin handle both find the emulator through
 * `FIRESTORE_EMULATOR_HOST` and the project through `GCLOUD_PROJECT`, which
 * `firebase emulators:exec` exports.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminFirestore } from '../../../functions/src/adminApp'
import { migrateStoredCharacter } from '../../../scripts/characters/run.mjs'
import { reviveTimestamps, type CharacterFixture } from './characterFixtures'
import { characterVersioningByRuleSet, migrateCharacter, type CharacterRuleSetId, type StoredCharacter } from './characterMigrations'
import demoCleric from './ose/fixtures/demo-cleric.json'
import demoFighter from './ose/fixtures/demo-fighter.json'
import demoMagicUser from './ose/fixtures/demo-magic-user.json'
import demoThief from './ose/fixtures/demo-thief.json'
import legacy from './ose/fixtures/legacy.json'
import filledVtmSheet from './vtm/fixtures/filled-sheet.json'
import olderVtmSheet from './vtm/fixtures/older-sheet.json'

// `firebase-admin` resolves out of `functions/node_modules`, which a module
// under `src/` cannot reach, so the handle and its type come from the Cloud
// Functions package. Fixture timestamps go in as plain `Date`s; the admin SDK
// stores them as timestamps.
type AdminFirestore = ReturnType<typeof adminFirestore>
type AdminTimestamp = { isEqual: (other: AdminTimestamp) => boolean }

const SCRIPT = fileURLToPath(new URL('../../../scripts/characters/migrate.mjs', import.meta.url))

const OSE_CAMPAIGN = 'groups/g1/campaigns/ose-campaign'
const VTM_CAMPAIGN = 'groups/g1/campaigns/vtm-campaign'
const EMPTY_CAMPAIGN = 'groups/g2/campaigns/empty-campaign'
const UNREGISTERED_CAMPAIGN = 'groups/g2/campaigns/unregistered-campaign'
const FLAT_CHARACTER = 'campaigns/flat-campaign/characters/flat-character'

const demoFixtures = [demoCleric, demoFighter, demoMagicUser, demoThief]
const legacyFixtures: CharacterFixture[] = Object.values(legacy)

// Each campaign, its stored `system` (absent when undefined), its rule set and its characters.
const campaigns: { path: string; system: string; ruleSetId: CharacterRuleSetId; characters: CharacterFixture[] }[] = [
  { path: OSE_CAMPAIGN, system: 'ose', ruleSetId: 'ose', characters: [...demoFixtures, ...legacyFixtures] },
  { path: VTM_CAMPAIGN, system: 'vtm', ruleSetId: 'vtm', characters: [filledVtmSheet, olderVtmSheet] },
  { path: EMPTY_CAMPAIGN, system: '', ruleSetId: 'ose', characters: [legacy['old-lists'], legacy['legacy-gold']] },
  { path: UNREGISTERED_CAMPAIGN, system: 'pathfinder', ruleSetId: 'ose', characters: [legacy['manual-ac-flag']] },
]

const DISAGREEING = `${OSE_CAMPAIGN}/characters/vtm-in-ose`
const NEWER = `${VTM_CAMPAIGN}/characters/vtm-newer`

let db: AdminFirestore

const fixtureData = (data: StoredCharacter) => reviveTimestamps(data, (iso) => new Date(iso)) as StoredCharacter

async function seed() {
  for (const campaign of campaigns) {
    await db.doc(campaign.path).set({ name: 'Campaign', system: campaign.system })
    for (const character of campaign.characters) {
      await db.doc(`${campaign.path}/characters/${character.id}`).set(fixtureData(character.data))
    }
  }
  await db.doc('campaigns/flat-campaign').set({ name: 'Flat campaign' })
  await db.doc(FLAT_CHARACTER).set(fixtureData(legacy['old-lists'].data))
}

async function seedFlagged() {
  await db.doc(DISAGREEING).set(fixtureData(filledVtmSheet.data))
  await db.doc(NEWER).set(fixtureData({ ...olderVtmSheet.data, schemaVersion: 2 }))
}

async function wipe() {
  for (const root of ['groups', 'campaigns']) {
    for (const snapshot of (await db.collection(root).listDocuments())) await db.recursiveDelete(snapshot)
  }
}

type StoredDocument = { data: StoredCharacter; updateTime: AdminTimestamp }

/** Every character document, grouped and flat, by path. */
async function readCharacters(): Promise<Map<string, StoredDocument>> {
  const snapshots = await db.collectionGroup('characters').get()
  return new Map(snapshots.docs.map((snapshot) => [snapshot.ref.path, { data: snapshot.data(), updateTime: snapshot.updateTime }]))
}

const dataByPath = (documents: Map<string, StoredDocument>) =>
  new Map([...documents].map(([path, document]) => [path, document.data]))

function expectUnwritten(before: Map<string, StoredDocument>, after: Map<string, StoredDocument>, paths = [...before.keys()]) {
  for (const path of paths) {
    expect(after.get(path)?.data, path).toEqual(before.get(path)?.data)
    expect(after.get(path)?.updateTime.isEqual(before.get(path)!.updateTime), path).toBe(true)
  }
}

/** Runs the CLI with the suite's environment, or with `env` in its place. */
function runScript(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, ...args], { env, encoding: 'utf8' })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/** The plan the steps alone give for every grouped character as stored now. */
function expectedAfterMigration(before: Map<string, StoredDocument>) {
  return new Map(campaigns.flatMap((campaign) => campaign.characters.map((character) => {
    const path = `${campaign.path}/characters/${character.id}`
    const stored = before.get(path)!.data
    return [path, migrateCharacter(characterVersioningByRuleSet[campaign.ruleSetId], character.id, stored).document] as const
  })))
}

const outputs: string[] = []

beforeAll(() => {
  db = adminFirestore()
})

beforeEach(async () => {
  await wipe()
  await seed()
})

describe('the dry run', () => {
  it('prints the expected counts and leaves every document unchanged', async () => {
    const before = await readCharacters()
    const run = runScript([])
    outputs.push(run.stdout, run.stderr)

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('dry run, nothing will be written')
    expect(run.stdout).toContain([
      'Characters by rule set, by stored version',
      '  ose (current version 1): 20 documents; version 0: 20; 20 to convert, 0 already current',
      '  vtm (current version 1): 2 documents; version 0: 2; 2 to convert, 0 already current',
      '  lubec (current version 1): 0 documents; none; 0 to convert, 0 already current',
      'OSE characters to convert, by old shape',
      '  old lists, no inventory: 7',
      '  old lists beside an inventory: 3',
      '  explicitly empty inventory: 2',
      '  rows without ids: 3',
      '  legacy gold: 3',
      '  manual-AC flag: 2',
      '  arcane caster without a spell book: 5',
      '  no details: 0',
      'Campaigns that resolve to OSE without naming it',
      '  no system: 0',
      '  empty system: 1',
      `    ${EMPTY_CAMPAIGN}`,
      '  unregistered system: 1',
      `    ${UNREGISTERED_CAMPAIGN}`,
      'Flagged documents, left unchanged',
      '  none',
      'Dry run: 22 to convert, 0 already current, 0 flagged and left unchanged. Nothing was written.',
    ].join('\n'))
    expectUnwritten(before, await readCharacters())
  })
})

describe('the write run', () => {
  it('leaves each document equal to the steps\' output, with updatedAt unchanged, and the flat tree alone', async () => {
    const before = await readCharacters()
    const run = runScript(['--apply'])
    outputs.push(run.stdout, run.stderr)

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('Wrote 22 documents; 0 already current; 0 flagged and left unchanged.')
    expect(run.stdout).toContain(`${OSE_CAMPAIGN}/characters/legacy-old-lists: version 0 to 1\n  removed details.armour\n  changed details.inventory\n  removed details.weapons\n  changed schemaVersion`)
    expect(run.stdout).toContain(`${VTM_CAMPAIGN}/characters/vtm-older: version 0 to 1\n  changed schemaVersion`)

    const after = await readCharacters()
    for (const [path, expected] of expectedAfterMigration(before)) {
      expect(after.get(path)?.data, path).toEqual(expected)
      const updatedAt = after.get(path)?.data.updatedAt as AdminTimestamp | undefined
      if (updatedAt) expect(updatedAt.isEqual(before.get(path)!.data.updatedAt as AdminTimestamp), path).toBe(true)
    }
    expectUnwritten(before, after, [FLAT_CHARACTER])
  })

  it('writes nothing the second time and reports every document as current', async () => {
    expect(runScript(['--apply']).status).toBe(0)
    const before = await readCharacters()
    const run = runScript(['--apply'])
    outputs.push(run.stdout, run.stderr)

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('Wrote 0 documents; 22 already current; 0 flagged and left unchanged.')
    expect(run.stdout).not.toContain('version 0 to 1')
    expectUnwritten(before, await readCharacters())
  })

  it('finishes a run stopped after some documents with the same documents as one full run', async () => {
    expect(runScript(['--apply']).status).toBe(0)
    const oneFullRun = dataByPath(await readCharacters())

    await wipe()
    await seed()
    const firstCampaign = await db.collection(`${OSE_CAMPAIGN}/characters`).listDocuments()
    for (const ref of firstCampaign.slice(0, 7)) await migrateStoredCharacter(db, ref, 'ose')
    const run = runScript(['--apply'])

    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('Wrote 15 documents; 7 already current; 0 flagged and left unchanged.')
    expect(dataByPath(await readCharacters())).toEqual(oneFullRun)
  })

  it('leaves a character whose system disagrees, and one above the current version, unchanged, lists them and fails', async () => {
    await seedFlagged()
    const before = await readCharacters()
    const run = runScript(['--apply'])
    outputs.push(run.stdout, run.stderr)

    expect(run.status).toBe(1)
    expect(run.stdout).toContain([
      'Flagged documents, left unchanged',
      `  ${DISAGREEING}: its system disagrees with its campaign's rule set`,
      `  ${NEWER}: version 2 is above the current version`,
    ].join('\n'))
    expect(run.stdout).toContain('Wrote 22 documents; 0 already current; 2 flagged and left unchanged.')
    expectUnwritten(before, await readCharacters(), [DISAGREEING, NEWER, FLAT_CHARACTER])
  })
})

describe('the guards', () => {
  it('refuses without an emulator and without --live, and writes nothing', async () => {
    const before = await readCharacters()
    const env = { ...process.env, FIRESTORE_EMULATOR_HOST: '' }
    for (const args of [[], ['--apply']]) {
      const run = runScript(args, env)
      expect(run.status).not.toBe(0)
      expect(run.stderr).toContain('No emulator is running (FIRESTORE_EMULATOR_HOST is not set)')
    }
    expectUnwritten(before, await readCharacters())
  })

  it('refuses --live while an emulator is set', () => {
    const run = runScript(['--apply', '--live', '--project', 'some-project'])
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain('--live was given but FIRESTORE_EMULATOR_HOST is set')
  })
})

// A name as a whole word, so the item "Gold" does not match the field path
// `details.storeGoldSlotIndices`.
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const asWord = (text: string) => new RegExp(`(?<![A-Za-z])${escapeRegExp(text)}(?![A-Za-z])`)

describe('the output', () => {
  it('never contains a character name or an item name from the fixtures', () => {
    expect(outputs.length).toBeGreaterThan(0)
    const fixtures = campaigns.flatMap((campaign) => campaign.characters)
    const itemNames = (data: StoredCharacter) => {
      const details = data.details as { inventory?: { name?: unknown }[] } | undefined
      return (details?.inventory ?? []).map((item) => item.name).filter((name): name is string => typeof name === 'string')
    }
    const texts = new Set(fixtures.flatMap((fixture) => [fixture.data.name as string, ...itemNames(fixture.data)]))
    for (const text of texts) {
      for (const output of outputs) expect(output).not.toMatch(asWord(text))
    }
  })
})
