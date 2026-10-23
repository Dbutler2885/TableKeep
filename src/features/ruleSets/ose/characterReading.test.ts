/**
 * How the OSE sheet and the map read a stored character, and what a save
 * leaves stored, recorded on the checked-in OSE fixtures. The app reads only
 * characters the migration has brought to the current version, so each
 * fixture is read as the migration leaves it.
 *
 * The sheet once converted an old-format character and healed a missing spell
 * book while hydrating, giving each new row a random id; OSE's step now does
 * both, with stable ids. A recorded sheet view therefore names an id the
 * stored document did not carry by its place among the new ids, so the same
 * items read the same whichever code made them.
 */
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import type { CharacterInventoryItem, CharacterRecord } from '../../../types/app'
import { seedInventoryFromDetails } from '../../character/inventoryHydration'
import { readCharacterSnapshot } from '../../character/lib/characterSnapshot'
import { characterSaveFields, emptyCharacterSaves } from '../../character/lib/characterWrites'
import { mapCharacterSummaryFromData } from '../../maps/lib/mapCharacterSummary'
import { markTimestamps, migratedFixture, reviveTimestamps, type CharacterFixture } from '../characterFixtures'
import { oseCharacterVersioning, vtmCharacterVersioning } from '../characterMigrations'
import type { StoredCharacter } from '../storedCharacter'
import filledVtmSheet from '../vtm/fixtures/filled-sheet.json'
import olderVtmSheet from '../vtm/fixtures/older-sheet.json'
import demoCleric from './fixtures/demo-cleric.json'
import demoFighter from './fixtures/demo-fighter.json'
import demoMagicUser from './fixtures/demo-magic-user.json'
import demoThief from './fixtures/demo-thief.json'
import legacy from './fixtures/legacy.json'

const SERVER_TIME = 'server time'

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  serverTimestamp: () => SERVER_TIME,
}))

type Fields = Record<string, unknown>

const revive = (fixture: unknown) =>
  reviveTimestamps(fixture, (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture

/** An OSE fixture as the migration leaves it, which is the only shape the app reads. */
const migrated = (fixture: CharacterFixture) => migratedFixture(oseCharacterVersioning, fixture)

const asFixtureJson = (value: unknown) =>
  `${JSON.stringify(markTimestamps(value, (entry) => entry instanceof Timestamp ? entry.toDate().toISOString() : null), null, 2)}\n`

const demoCases = Object.entries({
  'demo-magic-user': demoMagicUser,
  'demo-fighter': demoFighter,
  'demo-thief': demoThief,
  'demo-cleric': demoCleric,
}).map(([name, fixture]) => [name, revive(fixture)] as const)
const legacyCases = Object.entries(legacy).map(([name, fixture]) => [name, revive(fixture)] as const)
const oseCases = [...demoCases, ...legacyCases]
const vtmCases = [
  ['filled-sheet', migratedFixture(vtmCharacterVersioning, revive(filledVtmSheet))],
  ['older-sheet', migratedFixture(vtmCharacterVersioning, revive(olderVtmSheet))],
] as const

const VIEWER = { userId: 'viewer-uid', currentUsername: 'viewer1' }

/** A fixture, as the migration leaves it, as the OSE sheet's character list reads it. */
const sheetRecord = (fixture: CharacterFixture): CharacterRecord => {
  const { id, data } = migrated(fixture)
  return readCharacterSnapshot([{ id, data: () => data }], emptyCharacterSaves(), [], VIEWER)[0]
}

/** The items the sheet hydrates for a record. */
const sheetInventory = (record: Pick<CharacterRecord, 'details'>): CharacterInventoryItem[] =>
  record.details ? seedInventoryFromDetails(record.details).inventory : []

const isMap = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Timestamp)

/** Every `id` the stored document carries, at any depth; an empty id counts as none. */
function storedIds(value: unknown, ids = new Set<unknown>()): Set<unknown> {
  if (Array.isArray(value)) value.forEach((entry) => storedIds(entry, ids))
  if (!isMap(value)) return ids
  if (value.id) ids.add(value.id)
  Object.values(value).forEach((entry) => storedIds(entry, ids))
  return ids
}

/** The items with each id the stored document did not carry named by its place among the new ones. */
function withNewIdsNamed(items: CharacterInventoryItem[], stored: StoredCharacter) {
  const known = storedIds(stored)
  let made = 0
  return items.map((item) => (known.has(item.id) ? item : { ...item, id: `new-id-${++made}` }))
}

/** What the sheet shows of a stored character: its record and the items it hydrates. */
function sheetView(fixture: CharacterFixture) {
  // Fields a save writes back without reading them are recorded by the saved-document case.
  const { unknownFields: _unknownFields, ...record } = sheetRecord(fixture)
  if (!record.details) return record
  return { ...record, details: { ...record.details, inventory: withNewIdsNamed(sheetInventory(record), fixture.data) } }
}

/**
 * A document after `setDoc(payload, { merge: true })`: maps merge field by
 * field, and any other value, lists included, replaces what was stored.
 */
function mergedLikeFirestore(stored: Fields, payload: Fields): Fields {
  const merged = { ...stored }
  Object.entries(payload).forEach(([key, value]) => {
    merged[key] = isMap(value) && isMap(stored[key]) ? mergedLikeFirestore(stored[key], value) : value
  })
  return merged
}

const savedUnedited = (fixture: CharacterFixture): StoredCharacter =>
  mergedLikeFirestore(migrated(fixture).data, characterSaveFields(sheetRecord(fixture)))

describe('OSE sheet reading', () => {
  it.each(oseCases)('%s shows as its recorded sheet view', async (name, fixture) => {
    await expect(asFixtureJson(sheetView(fixture))).toMatchFileSnapshot(`./fixtures/recorded/sheet/${name}.view.json`)
  })

  it.each(demoCases)('%s is stored as recorded after an unedited save', async (name, fixture) => {
    await expect(asFixtureJson(savedUnedited(fixture))).toMatchFileSnapshot(`./fixtures/recorded/sheet/${name}.saved.json`)
  })
})

describe('map reading', () => {
  it.each(oseCases)('OSE %s gives its recorded map summary', async (name, fixture) => {
    const { id, data } = migrated(fixture)
    await expect(asFixtureJson(mapCharacterSummaryFromData(id, data))).toMatchFileSnapshot(`./fixtures/recorded/map/${name}.summary.json`)
  })

  it.each(vtmCases)('VtM %s gives its recorded map summary', async (name, { id, data }) => {
    await expect(asFixtureJson(mapCharacterSummaryFromData(id, data))).toMatchFileSnapshot(`../vtm/fixtures/recorded/${name}.summary.json`)
  })
})
