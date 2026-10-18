import { describe, expect, it } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import { readStoredCharacter } from '../lib/storedCharacterRecord'
import { needsMediaUrls, withResolvedMedia } from './useCharacterMediaUrls'

const viewer = { userId: 'user-1', currentUsername: 'Player One' }
const tokenIcon = { icon: 'pawn', color: '#000', size: 30 }
const character = (fields: Record<string, unknown> = {}): CharacterRecord =>
  readStoredCharacter('a', { ownerUserId: 'user-1', ...fields }, undefined, viewer)

describe('needsMediaUrls', () => {
  it('needs a URL for a stored image without a renderable one', () => {
    expect(needsMediaUrls(character({ portraitPath: 'p.png' }))).toBe(true)
    expect(needsMediaUrls(character({ portraitPath: 'p.png', portraitUrl: 'blob:p' }))).toBe(true)
    expect(needsMediaUrls(character({ tokenIcon: { ...tokenIcon, customImagePath: 't.png' } }))).toBe(true)
  })

  it('needs nothing without stored images or once their URLs are renderable', () => {
    expect(needsMediaUrls(character())).toBe(false)
    expect(needsMediaUrls(character({
      portraitPath: 'p.png',
      portraitUrl: 'https://cdn.test/p.png',
      tokenIcon: { ...tokenIcon, customImagePath: 't.png', customImageUrl: 'data:image/png;base64,AAAA' },
    }))).toBe(false)
  })
})

describe('withResolvedMedia', () => {
  it('fills in every URL that was found', () => {
    const healed = withResolvedMedia(character({ tokenIcon }), {
      portraitUrl: 'https://cdn.test/p.png',
      customImageUrl: 'https://cdn.test/t.png',
    })

    expect(healed.portraitUrl).toBe('https://cdn.test/p.png')
    expect(healed.tokenIcon).toEqual({ ...tokenIcon, customImageUrl: 'https://cdn.test/t.png' })
  })

  it('leaves a URL that was not found as it was, in a new record', () => {
    const original = character({ tokenIcon })
    const healed = withResolvedMedia(original, { portraitUrl: null, customImageUrl: null })

    expect(healed).toEqual(original)
    expect(healed).not.toBe(original)
  })
})
