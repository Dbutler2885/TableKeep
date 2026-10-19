/**
 * How the VtM sheet reads a stored character and what a save leaves stored,
 * recorded on the checked-in VtM fixtures before the reading moved onto VtM's
 * steps and parser, and the parser's own round trip.
 */
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it, vi } from 'vitest'
import { readVtmCharacterDoc, vtmCharacterParser } from '../../character/vtmCharacterRecord'
import { vtmCharacterSaveFields } from '../../character/vtmCharacterWrites'
import { markTimestamps, reviveTimestamps, type CharacterFixture } from '../characterFixtures'
import { readCharacter, readStoredCharacter } from '../characterParser'
import { ruleSets } from '../registry'
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
  reviveTimestamps(fixture, (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture

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

const read = ({ id, data }: CharacterFixture) => readVtmCharacterDoc(id, data, undefined)!

const savedUnedited = (fixture: CharacterFixture): StoredCharacter =>
  mergedLikeFirestore(fixture.data, vtmCharacterSaveFields(read(fixture)))

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
    const record = readVtmCharacterDoc('a', { system: 'vtm', creationMode, creationStatus }, undefined)
    expect(record?.creationStatus).toBe(expected)
  })
})

const parse = ({ id, data }: CharacterFixture) => readStoredCharacter(ruleSets.vtm.characters, vtmCharacterParser, id, data)

const reparse = (id: string, record: ReturnType<typeof parse>) =>
  readStoredCharacter(ruleSets.vtm.characters, vtmCharacterParser, id, vtmCharacterParser.serialize(record))

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

  it('reads a character at any stored version the same', () => {
    const { id, data } = cases[0][1]
    const unversioned = readVtmCharacterDoc(id, data, undefined)
    expect(readVtmCharacterDoc(id, { ...data, schemaVersion: 1 }, undefined)).toEqual(unversioned)
    expect(readVtmCharacterDoc(id, { ...data, schemaVersion: 2 }, undefined)).toEqual(unversioned)
  })
})

describe('reading a stored character', () => {
  it('parses what the rule set\'s steps make of the stored document', () => {
    const versioning = {
      schemaVersion: 2,
      migrations: [
        (document: StoredCharacter) => ({ ...document, schemaVersion: 1, first: true }),
        (document: StoredCharacter) => ({ ...document, schemaVersion: 2, second: true }),
      ],
    }
    const parser = { parse: (id: string, stored: StoredCharacter) => ({ id, stored }), serialize: () => ({}) }

    expect(readStoredCharacter(versioning, parser, 'a', { name: 'Edda' })).toEqual({
      id: 'a',
      stored: { name: 'Edda', schemaVersion: 2, first: true, second: true },
    })
    expect(readStoredCharacter(versioning, parser, 'a', { schemaVersion: 3 })).toEqual({ id: 'a', stored: { schemaVersion: 3 } })
  })

  it('keeps the document as the steps left it beside the record', () => {
    const versioning = { schemaVersion: 1, migrations: [(document: StoredCharacter) => ({ ...document, schemaVersion: 1 })] }
    const parser = { parse: (id: string, stored: StoredCharacter) => ({ id, name: stored.name }), serialize: () => ({}) }
    const raw = { name: 'Edda', hp: 3 }

    expect(readCharacter(versioning, parser, 'a', raw)).toEqual({
      stored: { name: 'Edda', hp: 3, schemaVersion: 1 },
      record: { id: 'a', name: 'Edda' },
    })
    expect(raw).toEqual({ name: 'Edda', hp: 3 })
  })
})
