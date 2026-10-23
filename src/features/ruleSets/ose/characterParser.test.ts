/**
 * OSE's character parser, on the checked-in OSE fixtures as OSE's steps leave
 * them: a parse is stable, survives a serialize, and keeps the fields the
 * record does not model.
 */
import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { oseCharacterParser } from '../../character/lib/storedCharacterRecord'
import { migratedFixture, reviveTimestamps, type CharacterFixture } from '../characterFixtures'
import { oseCharacterVersioning } from '../characterMigrations'
import { ruleSets } from '../registry'
import demoCleric from './fixtures/demo-cleric.json'
import demoFighter from './fixtures/demo-fighter.json'
import demoMagicUser from './fixtures/demo-magic-user.json'
import demoThief from './fixtures/demo-thief.json'
import legacy from './fixtures/legacy.json'

type Fields = Record<string, unknown>

const revive = (fixture: unknown) =>
  migratedFixture(oseCharacterVersioning, reviveTimestamps(fixture, (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture)

const cases = Object.entries({
  'demo-magic-user': demoMagicUser,
  'demo-fighter': demoFighter,
  'demo-thief': demoThief,
  'demo-cleric': demoCleric,
  ...legacy,
}).map(([name, fixture]) => [name, revive(fixture)] as const)
const legacyCases = cases.filter(([name]) => !name.startsWith('demo-'))

const parse = ({ id, data }: CharacterFixture) => oseCharacterParser.parse(id, data)

const reparse = (id: string, record: ReturnType<typeof parse>) =>
  oseCharacterParser.parse(id, oseCharacterParser.serialize(record))

describe('OSE character parser', () => {
  it('is the parser OSE declares', () => {
    expect(ruleSets.ose.characters.parser).toBe(oseCharacterParser)
  })

  it.each(cases)('%s parses the same twice', (_name, fixture) => {
    expect(parse(fixture)).toEqual(parse(fixture))
  })

  it.each(cases)('%s parses the same after a serialize', (_name, fixture) => {
    const parsed = parse(fixture)
    expect(reparse(fixture.id, parsed)).toEqual(parsed)
  })

  // Every legacy fixture carries unknown fields at the top level, nested in
  // the sheet and in a list row; the demo characters carry none.
  it.each(legacyCases)('%s keeps its unknown fields through a parse and a serialize', (_name, fixture) => {
    const serialized = oseCharacterParser.serialize(parse(fixture))
    expect(serialized.unknownTopLevel).toEqual({ note: 'kept as stored', list: [1, 'two', { three: 3 }] })
    const details = serialized.details as { unknownNested: unknown; storeCart: Fields[] }
    expect(details.unknownNested).toEqual({ kept: true, deeper: { value: 7 } })
    expect(details.storeCart[0].unknownRowField).toBe('kept on the cart row')
  })

  it('keeps fields the record does not model, and leaves out the writers\' own and the version', () => {
    const createdAt = Timestamp.fromDate(new Date('2025-03-01T18:00:00.000Z'))
    const parsed = parseStored({
      name: 'Aldric', hidden: true, deletedAt: createdAt, createdAt, updatedAt: createdAt, schemaVersion: 1, schemaWrittenAt: createdAt,
    })
    expect(parsed.unknownFields).toEqual({ hidden: true, deletedAt: createdAt })
    const serialized = oseCharacterParser.serialize(parsed)
    expect(serialized).toMatchObject({ hidden: true, deletedAt: createdAt, name: 'Aldric' })
    for (const field of ['createdAt', 'updatedAt', 'schemaVersion', 'schemaWrittenAt']) {
      expect(serialized).not.toHaveProperty(field)
    }
  })

  it('gives a record without unknown fields none to write back', () => {
    expect(parseStored({ name: 'Aldric', schemaVersion: 1 })).not.toHaveProperty('unknownFields')
  })

  it('serializes no media URL', () => {
    const parsed = parseStored({
      portraitPath: 'p.png',
      portraitUrl: 'https://cdn.test/portrait.png',
      tokenIcon: { icon: 'custom', color: '#000', size: 34, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' },
    })
    const serialized = oseCharacterParser.serialize(parsed)
    expect(parsed.portraitUrl).toBe('https://cdn.test/portrait.png')
    expect(serialized).not.toHaveProperty('portraitUrl')
    expect(serialized.tokenIcon).toEqual({ icon: 'custom', color: '#000', size: 34, customImagePath: 't.png' })
  })
})

function parseStored(data: Fields) {
  return oseCharacterParser.parse('a', data)
}
