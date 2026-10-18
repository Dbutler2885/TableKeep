import { describe, expect, it } from 'vitest'
import { normalizeVtmSheet, readVtmCharacterDoc } from './vtmCharacterRecord'
import { defaultVtmSheet, makeVtmCharacter } from './vtmDefaults'

const local = (fields: Partial<ReturnType<typeof makeVtmCharacter>> = {}) => ({
  ...makeVtmCharacter('user-1', 'player1'),
  ...fields,
})

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

describe('readVtmCharacterDoc', () => {
  it('is null for another system', () => {
    expect(readVtmCharacterDoc('a', { system: 'ose' }, undefined)).toBeNull()
  })

  it('prefers a stored portrait URL, even an empty one, over the local one', () => {
    const resolved = local({ portraitPath: 'p.png', portraitUrl: 'https://cdn.test/local.png' })

    expect(readVtmCharacterDoc('a', { system: 'vtm', portraitPath: 'p.png', portraitUrl: '' }, resolved)?.portraitUrl).toBe('')
    expect(readVtmCharacterDoc('a', { system: 'vtm', portraitPath: 'p.png' }, resolved)?.portraitUrl).toBe('https://cdn.test/local.png')
  })

  it('does not carry over a local portrait URL that cannot render', () => {
    const unresolved = local({ portraitPath: 'p.png', portraitUrl: 'p.png' })

    expect(readVtmCharacterDoc('a', { system: 'vtm', portraitPath: 'p.png' }, unresolved)?.portraitUrl).toBeNull()
  })

  it('carries over a local token image URL only for the same storage path', () => {
    const resolved = local({
      tokenIcon: { icon: 'bat', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' },
    })
    const stored = (customImagePath: string) =>
      ({ system: 'vtm', tokenIcon: { icon: 'bat', color: '#000', size: 30, customImagePath } })

    expect(readVtmCharacterDoc('a', stored('t.png'), resolved)?.tokenIcon.customImageUrl).toBe('https://cdn.test/t.png')
    expect(readVtmCharacterDoc('a', stored('other.png'), resolved)?.tokenIcon.customImageUrl).toBeUndefined()
  })

  it('keeps a stored token image URL', () => {
    const tokenIcon = { icon: 'bat', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'https://cdn.test/s.png' }

    expect(readVtmCharacterDoc('a', { system: 'vtm', tokenIcon }, undefined)?.tokenIcon).toEqual(tokenIcon)
  })
})
