import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { reviveTimestamps, type CharacterFixture } from '../characterFixtures'
import filledSheet from './fixtures/filled-sheet.json'
import olderSheet from './fixtures/older-sheet.json'
import { vtmCharacterV0ToV1 } from './characterMigrations'

const revive = (fixture: unknown) =>
  reviveTimestamps(fixture, (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture

const cases = [
  ['a filled-in sheet', revive(filledSheet)],
  ['a sheet saved before newer fields existed', revive(olderSheet)],
] as const

describe('VtM step 0 to 1', () => {
  it.each(cases)('%s changes only in its version', (_name, { id, data }) => {
    expect(vtmCharacterV0ToV1(data, id)).toEqual({ ...data, schemaVersion: 1 })
  })

  it.each(cases)('%s keeps its unknown fields and timestamps as the same values', (_name, { id, data }) => {
    const migrated = vtmCharacterV0ToV1(data, id)
    expect(migrated.createdAt).toBeInstanceOf(Timestamp)
    expect(migrated.createdAt).toBe(data.createdAt)
    expect(migrated.vtm).toBe(data.vtm)
    expect(migrated.unknownTopLevel).toEqual({ note: 'kept as stored', list: [1, 'two', { three: 3 }] })
    const sheet = migrated.vtm as { unknownNested: unknown; disciplines: { unknownRowField?: string }[] }
    expect(sheet.unknownNested).toEqual({ kept: true, deeper: { value: 7 } })
    expect(sheet.disciplines[0].unknownRowField).toBe('kept on the discipline row')
  })

  it('leaves the older sheet missing what it was saved without', () => {
    const { data } = revive(olderSheet)
    const sheet = vtmCharacterV0ToV1(data, 'vtm-older').vtm as Record<string, unknown>
    expect(sheet).not.toHaveProperty('xpLedger')
    expect(sheet).not.toHaveProperty('freebieDots')
    expect(data).not.toHaveProperty('creationStatus')
  })
})
