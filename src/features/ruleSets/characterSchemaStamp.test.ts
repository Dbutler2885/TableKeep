import { describe, expect, it, vi } from 'vitest'

const SERVER_TIMESTAMP = { sentinel: 'serverTimestamp' }
vi.mock('firebase/firestore', () => ({ serverTimestamp: () => SERVER_TIMESTAMP }))

const { assertCharacterAtCurrentVersion, characterSchemaStamp, CHARACTER_BEING_UPDATED_MESSAGE } = await import('./characterSchemaStamp')

const versioning = { schemaVersion: 2, migrations: [] }

describe('character schema stamp', () => {
  it('stamps the current version and the server time', () => {
    expect(characterSchemaStamp(versioning)).toEqual({ schemaVersion: 2, schemaWrittenAt: SERVER_TIMESTAMP })
  })

  it('accepts a character at the current version', () => {
    expect(() => assertCharacterAtCurrentVersion({ schemaVersion: 2 }, versioning)).not.toThrow()
  })

  it.each([
    ['missing', {}],
    ['below', { schemaVersion: 1 }],
    ['above', { schemaVersion: 3 }],
    ['not a number', { schemaVersion: '2' }],
  ])('refuses a character whose version is %s with the plain message', (_case, stored) => {
    expect(() => assertCharacterAtCurrentVersion(stored, versioning)).toThrow(new Error(CHARACTER_BEING_UPDATED_MESSAGE))
  })

  it('treats a missing version as 0', () => {
    expect(() => assertCharacterAtCurrentVersion({}, { schemaVersion: 0, migrations: [] })).not.toThrow()
  })
})

it('checks only the version, ignoring system and an absent or stale write time', () => {
  for (const stored of [
    { schemaVersion: 2, system: 'vtm' },
    { schemaVersion: 2, system: 'ose', schemaWrittenAt: 'old-time' },
  ]) expect(() => assertCharacterAtCurrentVersion(stored, versioning)).not.toThrow()
})
