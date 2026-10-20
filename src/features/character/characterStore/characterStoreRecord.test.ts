import { describe, expect, it } from 'vitest'
import { vtmCharacterStore } from '../vtmCharacterRecord'
import { makeVtmCharacter } from '../vtmDefaults'
import { readCharacterStoreDoc } from './characterStoreRecord'

const local = (fields: Partial<ReturnType<typeof makeVtmCharacter>> = {}) => ({
  ...makeVtmCharacter('user-1', 'player1'),
  ...fields,
})

describe('readCharacterStoreDoc', () => {
  it('is null for another system', () => {
    expect(readCharacterStoreDoc(vtmCharacterStore, 'a', { system: 'ose' }, undefined)).toBeNull()
  })

  it('prefers a stored portrait URL, even an empty one, over the local one', () => {
    const resolved = local({ portraitPath: 'p.png', portraitUrl: 'https://cdn.test/local.png' })

    expect(readCharacterStoreDoc(vtmCharacterStore, 'a', { system: 'vtm', portraitPath: 'p.png', portraitUrl: '' }, resolved)?.portraitUrl).toBe('')
    expect(readCharacterStoreDoc(vtmCharacterStore, 'a', { system: 'vtm', portraitPath: 'p.png' }, resolved)?.portraitUrl).toBe('https://cdn.test/local.png')
  })

  it('does not carry over a local portrait URL that cannot render', () => {
    const unresolved = local({ portraitPath: 'p.png', portraitUrl: 'p.png' })

    expect(readCharacterStoreDoc(vtmCharacterStore, 'a', { system: 'vtm', portraitPath: 'p.png' }, unresolved)?.portraitUrl).toBeNull()
  })

  it('carries over a local token image URL only for the same storage path', () => {
    const resolved = local({
      tokenIcon: { icon: 'bat', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' },
    })
    const stored = (customImagePath: string) =>
      ({ system: 'vtm', tokenIcon: { icon: 'bat', color: '#000', size: 30, customImagePath } })

    expect(readCharacterStoreDoc(vtmCharacterStore, 'a', stored('t.png'), resolved)?.tokenIcon.customImageUrl).toBe('https://cdn.test/t.png')
    expect(readCharacterStoreDoc(vtmCharacterStore, 'a', stored('other.png'), resolved)?.tokenIcon.customImageUrl).toBeUndefined()
  })

  it('keeps a stored token image URL', () => {
    const tokenIcon = { icon: 'bat', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'https://cdn.test/s.png' }

    expect(readCharacterStoreDoc(vtmCharacterStore, 'a', { system: 'vtm', tokenIcon }, undefined)?.tokenIcon).toEqual(tokenIcon)
  })
})
