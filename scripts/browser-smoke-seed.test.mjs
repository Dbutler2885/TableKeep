import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  characterPath,
  readDocumentFields,
  seedCharacter,
  toFirestoreFields,
  toFirestoreValue,
} from './browser-smoke-seed.mjs'

const documentsUrl = 'http://127.0.0.1:8080/v1/projects/homeboyshouse-dev/databases/(default)/documents'

function stubFetch(response) {
  const fetch = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('browser smoke seeding', () => {
  it('encodes plain values in the Firestore REST shape', () => {
    expect(toFirestoreFields({
      name: 'Aldric',
      level: 3,
      encumbrance: 1.5,
      dead: false,
      portraitPath: null,
      createdAt: new Date('2026-10-18T12:00:00.000Z'),
    })).toEqual({
      name: { stringValue: 'Aldric' },
      level: { integerValue: '3' },
      encumbrance: { doubleValue: 1.5 },
      dead: { booleanValue: false },
      portraitPath: { nullValue: null },
      createdAt: { timestampValue: '2026-10-18T12:00:00.000Z' },
    })
  })

  it('encodes nested arrays and maps', () => {
    expect(toFirestoreValue({ details: { items: ['Rope', { name: 'Torch', qty: 6 }] } })).toEqual({
      mapValue: {
        fields: {
          details: {
            mapValue: {
              fields: {
                items: {
                  arrayValue: {
                    values: [
                      { stringValue: 'Rope' },
                      { mapValue: { fields: { name: { stringValue: 'Torch' }, qty: { integerValue: '6' } } } },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    })
  })

  it('leaves out keys whose value is undefined, at every depth', () => {
    expect(toFirestoreFields({ name: 'Kept', slug: undefined, details: { inventory: undefined } })).toEqual({
      name: { stringValue: 'Kept' },
      details: { mapValue: { fields: {} } },
    })
  })

  it.each([
    { name: 'NaN', value: Number.NaN },
    { name: 'Infinity', value: Number.POSITIVE_INFINITY },
    { name: 'a function', value: () => {} },
    { name: 'a class instance', value: new Map() },
    { name: 'undefined inside an array', value: [undefined] },
  ])('refuses $name rather than writing something the case did not ask for', ({ value }) => {
    expect(() => toFirestoreValue(value)).toThrow(/Cannot seed/)
  })
})

describe('character documents', () => {
  it('builds the group-scoped character path', () => {
    expect(characterPath({ groupId: 'g1', campaignId: 'c1', characterId: 'x1' }))
      .toBe('groups/g1/campaigns/c1/characters/x1')
  })

  it('seeds a character under the id it is given, as the owner', async () => {
    const fetch = stubFetch({ ok: true })

    await expect(seedCharacter({ groupId: 'g1', campaignId: 'c1', characterId: 'x1', fields: { name: 'Mina' } }))
      .resolves.toBe('x1')

    expect(fetch).toHaveBeenCalledWith(`${documentsUrl}/groups/g1/campaigns/c1/characters/x1`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { name: { stringValue: 'Mina' } } }),
    })
  })

  it('reads a stored document back in the REST shape the seed encodes to', async () => {
    const fields = toFirestoreFields({ name: 'Mina', xp: 3 })
    const fetch = stubFetch({ ok: true, json: async () => ({ name: 'ignored', fields }) })

    await expect(readDocumentFields('groups/g1/campaigns/c1/characters/x1')).resolves.toEqual(fields)
    expect(fetch).toHaveBeenCalledWith(`${documentsUrl}/groups/g1/campaigns/c1/characters/x1`, {
      headers: { authorization: 'Bearer owner' },
    })
  })

  it('names the document and the status when a read fails', async () => {
    stubFetch({ ok: false, status: 404, text: async () => 'not found' })

    await expect(readDocumentFields('groups/g1/missing')).rejects.toThrow('Reading groups/g1/missing failed (404): not found')
  })
})
