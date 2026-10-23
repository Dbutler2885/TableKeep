/**
 * How the VtM sheet reads a stored character and what a save leaves stored,
 * recorded on the checked-in VtM fixtures as VtM's steps leave them, and the
 * parser's own round trip.
 */
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import { readCharacterStoreDoc } from '../../character/characterStore/characterStoreRecord'
import { characterStoreSaveFields } from '../../character/characterStore/characterStoreWrites'
import { vtmCharacterParser, vtmCharacterStore } from '../../character/vtmCharacterRecord'
import { markTimestamps, migratedFixture, reviveTimestamps, type CharacterFixture } from '../characterFixtures'
import { vtmCharacterVersioning } from '../characterMigrations'
import type { StoredCharacter } from '../storedCharacter'
import filledSheet from './fixtures/filled-sheet.json'
import olderSheet from './fixtures/older-sheet.json'

const SERVER_TIME = 'server time'

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  serverTimestamp: () => SERVER_TIME,
}))

type Fields = Record<string, unknown>

const revive = (fixture: unknown) =>
  migratedFixture(vtmCharacterVersioning, reviveTimestamps(fixture, (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture)

const asFixtureJson = (value: unknown) =>
  `${JSON.stringify(markTimestamps(value, (entry) => entry instanceof Timestamp ? entry.toDate().toISOString() : null), null, 2)}\n`

const cases = [
  ['filled-sheet', revive(filledSheet)],
  ['older-sheet', revive(olderSheet)],
] as const

const isMap = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Timestamp)

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

// The sheet's own record; fields a save writes back without reading them are
// recorded by the saved-document case.
const sheetRecord = (record: Fields) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'unknownFields'))

const read = ({ id, data }: CharacterFixture) => readCharacterStoreDoc(vtmCharacterStore, id, data, undefined)!

const savedUnedited = (fixture: CharacterFixture): StoredCharacter =>
  mergedLikeFirestore(fixture.data, characterStoreSaveFields(vtmCharacterStore, read(fixture)))

describe('VtM reading and saving', () => {
  it.each(cases)('%s reads as its recorded sheet record', async (name, fixture) => {
    await expect(asFixtureJson(sheetRecord(read(fixture)))).toMatchFileSnapshot(`./fixtures/recorded/${name}.read.json`)
  })

  it.each(cases)('%s is stored as recorded after an unedited save', async (name, fixture) => {
    await expect(asFixtureJson(savedUnedited(fixture))).toMatchFileSnapshot(`./fixtures/recorded/${name}.saved.json`)
  })

  it.each(cases)('%s keeps its unknown fields and its creation time through a save', (_name, fixture) => {
    const saved = savedUnedited(fixture)
    expect(saved.unknownTopLevel).toEqual(fixture.data.unknownTopLevel)
    expect(saved.createdAt).toBe(fixture.data.createdAt)
    expect(saved.updatedAt).toBe(SERVER_TIME)
    const sheet = saved.vtm as { unknownNested: unknown; disciplines: { unknownRowField?: string }[] }
    expect(sheet.unknownNested).toEqual({ kept: true, deeper: { value: 7 } })
    expect(sheet.disciplines[0].unknownRowField).toBe('kept on the discipline row')
  })

  it.each([
    ['new', undefined, 'draft'],
    ['established', undefined, 'established_draft'],
    [undefined, undefined, 'draft'],
    ['established', 'unknown', 'established_draft'],
    ['new', 'active', 'active'],
    ['established', 'draft', 'draft'],
  ])('a %s character stored with creation status %s reads as %s', (creationMode, creationStatus, expected) => {
    const record = readCharacterStoreDoc(vtmCharacterStore, 'a', { system: 'vtm', creationMode, creationStatus }, undefined)
    expect(record?.creationStatus).toBe(expected)
  })
})

const parse = ({ id, data }: CharacterFixture) => vtmCharacterParser.parse(id, data)

const reparse = (id: string, record: ReturnType<typeof parse>) =>
  vtmCharacterParser.parse(id, vtmCharacterParser.serialize(record))

describe('VtM character parser', () => {
  it.each(cases)('%s parses the same twice', (_name, fixture) => {
    expect(parse(fixture)).toEqual(parse(fixture))
  })

  it.each(cases)('%s parses the same after a serialize', (_name, fixture) => {
    const parsed = parse(fixture)
    expect(reparse(fixture.id, parsed)).toEqual(parsed)
  })

  it.each(cases)('%s keeps its unknown fields through a parse and a serialize', (_name, fixture) => {
    const serialized = vtmCharacterParser.serialize(parse(fixture))
    expect(serialized.unknownTopLevel).toEqual({ note: 'kept as stored', list: [1, 'two', { three: 3 }] })
    const sheet = serialized.vtm as { unknownNested: unknown; disciplines: { unknownRowField?: string }[] }
    expect(sheet.unknownNested).toEqual({ kept: true, deeper: { value: 7 } })
    expect(sheet.disciplines[0].unknownRowField).toBe('kept on the discipline row')
  })

  it.each(cases)('%s serializes no media URL, time or version field', (_name, fixture) => {
    const parsed = parse(fixture)
    const withUrls = {
      ...parsed,
      portraitUrl: 'https://cdn.test/portrait.png',
      tokenIcon: { ...parsed.tokenIcon, customImageUrl: 'https://cdn.test/token.png' },
    }
    const serialized = vtmCharacterParser.serialize(withUrls)
    expect(serialized).not.toHaveProperty('portraitUrl')
    expect(serialized.tokenIcon).not.toHaveProperty('customImageUrl')
    for (const field of ['createdAt', 'updatedAt', 'schemaVersion', 'schemaWrittenAt']) {
      expect(serialized).not.toHaveProperty(field)
    }
  })
})
