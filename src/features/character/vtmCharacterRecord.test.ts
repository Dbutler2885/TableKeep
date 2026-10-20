import { describe, expect, it } from 'vitest'
import { normalizeVtmSheet } from './vtmCharacterRecord'
import { defaultVtmSheet } from './vtmDefaults'

describe('normalizeVtmSheet', () => {
  it('is the default sheet for anything that is not an object', () => {
    expect(normalizeVtmSheet(undefined)).toEqual(defaultVtmSheet())
    expect(normalizeVtmSheet('sheet')).toEqual(defaultVtmSheet())
    expect(normalizeVtmSheet([])).toEqual(defaultVtmSheet())
  })

  it('merges each attribute and ability group on its own', () => {
    const defaults = defaultVtmSheet()

    const sheet = normalizeVtmSheet({
      attributes: { mental: { Wits: 4 } },
      abilities: { knowledges: { Occult: 3 }, skills: [] },
    })

    expect(sheet.attributes).toEqual({ ...defaults.attributes, mental: { ...defaults.attributes.mental, Wits: 4 } })
    expect(sheet.abilities).toEqual({ ...defaults.abilities, knowledges: { ...defaults.abilities.knowledges, Occult: 3 } })
  })

  it('keeps stored scalars and replaces a list only with a list', () => {
    const havens = [{ id: 'h1', location: 'Crypt', description: '' }]

    const sheet = normalizeVtmSheet({ humanity: 7, havens, rituals: { id: 'not a list' } })

    expect(sheet.humanity).toBe(7)
    expect(sheet.havens).toBe(havens)
    expect(sheet.rituals).toEqual([])
  })
})
