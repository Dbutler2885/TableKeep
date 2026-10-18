import { describe, expect, it, vi } from 'vitest'
import { makeVtmCharacter } from './vtmDefaults'

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' }, storage: { name: 'storage-stub' } }))

const { needsVtmMediaUrls, withResolvedVtmMedia } = await import('./useVtmCharacterMedia')

const base = makeVtmCharacter('user-1', 'player1')
const tokenIcon = { icon: 'bat', color: '#000', size: 30 }

describe('needsVtmMediaUrls', () => {
  it('is true only for a stored image whose URL cannot render', () => {
    expect(needsVtmMediaUrls(base)).toBe(false)
    expect(needsVtmMediaUrls({ ...base, portraitPath: 'p.png', portraitUrl: null })).toBe(true)
    expect(needsVtmMediaUrls({ ...base, portraitPath: 'p.png', portraitUrl: 'https://cdn.test/p.png' })).toBe(false)
    expect(needsVtmMediaUrls({ ...base, tokenIcon: { ...tokenIcon, customImagePath: 't.png' } })).toBe(true)
    expect(needsVtmMediaUrls({
      ...base,
      tokenIcon: { ...tokenIcon, customImagePath: 't.png', customImageUrl: 'data:image/png;base64,AA' },
    })).toBe(false)
  })
})

describe('withResolvedVtmMedia', () => {
  it('applies only the URLs that were found', () => {
    const character = { ...base, tokenIcon }

    expect(withResolvedVtmMedia(character, { portraitUrl: 'https://cdn.test/p.png', customImageUrl: null })).toEqual({
      ...character,
      portraitUrl: 'https://cdn.test/p.png',
    })
    expect(withResolvedVtmMedia(character, { portraitUrl: null, customImageUrl: 'https://cdn.test/t.png' })).toEqual({
      ...character,
      tokenIcon: { ...tokenIcon, customImageUrl: 'https://cdn.test/t.png' },
    })
  })
})
