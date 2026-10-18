import { describe, expect, it } from 'vitest'
import { toFirestoreFields, toFirestoreValue } from './browser-smoke-seed.mjs'

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
