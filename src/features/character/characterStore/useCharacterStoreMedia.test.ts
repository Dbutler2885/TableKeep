import { describe, expect, it, vi } from 'vitest'
import { makeVtmCharacter } from '../vtmDefaults'

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' }, storage: { name: 'storage-stub' } }))

const { needsCharacterStoreMediaUrls, withResolvedCharacterStoreMedia } = await import('./useCharacterStoreMedia')

const base = makeVtmCharacter('user-1', 'player1')
const tokenIcon = { icon: 'bat', color: '#000', size: 30 }

describe('needsCharacterStoreMediaUrls', () => {
  it('is true only for a stored image whose URL cannot render', () => {
    expect(needsCharacterStoreMediaUrls(base)).toBe(false)
    expect(needsCharacterStoreMediaUrls({ ...base, portraitPath: 'p.png', portraitUrl: null })).toBe(true)
    expect(needsCharacterStoreMediaUrls({ ...base, portraitPath: 'p.png', portraitUrl: 'https://cdn.test/p.png' })).toBe(false)
    expect(needsCharacterStoreMediaUrls({ ...base, tokenIcon: { ...tokenIcon, customImagePath: 't.png' } })).toBe(true)
    expect(needsCharacterStoreMediaUrls({
      ...base,
      tokenIcon: { ...tokenIcon, customImagePath: 't.png', customImageUrl: 'data:image/png;base64,AA' },
    })).toBe(false)
  })
})

describe('withResolvedCharacterStoreMedia', () => {
  it('applies only the URLs that were found', () => {
    const character = { ...base, tokenIcon }

    expect(withResolvedCharacterStoreMedia(character, { portraitUrl: 'https://cdn.test/p.png', customImageUrl: null })).toEqual({
      ...character,
      portraitUrl: 'https://cdn.test/p.png',
    })
    expect(withResolvedCharacterStoreMedia(character, { portraitUrl: null, customImageUrl: 'https://cdn.test/t.png' })).toEqual({
      ...character,
      tokenIcon: { ...tokenIcon, customImageUrl: 'https://cdn.test/t.png' },
    })
  })
})
