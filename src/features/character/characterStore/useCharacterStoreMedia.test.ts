// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { makeVtmCharacter } from '../vtmDefaults'

const resolveStoragePathUrl = vi.hoisted(() => vi.fn<(path: string) => Promise<string | null>>())

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' }, storage: { name: 'storage-stub' } }))
vi.mock('../../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../common/mediaStorage')>()),
  resolveStoragePathUrl,
}))

const { needsCharacterStoreMediaUrls, resolveCharacterStoreMediaUrls, useCharacterStoreMedia, withResolvedCharacterStoreMedia } =
  await import('./useCharacterStoreMedia')

afterEach(() => {
  cleanup()
  resolveStoragePathUrl.mockReset()
})

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

describe('resolving a character\'s media', () => {
  const stored = { ...base, portraitPath: 'p.png', tokenIcon: { ...tokenIcon, customImagePath: 't.png' } }
  const lookups = (urls: Record<string, string | Error>) =>
    resolveStoragePathUrl.mockImplementation(async (path) => {
      const url = urls[path]
      if (url instanceof Error) throw url
      return url ?? null
    })

  it('keeps the token image when the portrait\'s lookup fails, and the other way round', async () => {
    lookups({ 'p.png': new Error('storage/unknown'), 't.png': 'https://cdn.test/t.png' })
    await expect(resolveCharacterStoreMediaUrls(stored)).resolves.toEqual({ portraitUrl: null, customImageUrl: 'https://cdn.test/t.png' })

    lookups({ 'p.png': 'https://cdn.test/p.png', 't.png': new Error('storage/unknown') })
    await expect(resolveCharacterStoreMediaUrls(stored)).resolves.toEqual({ portraitUrl: 'https://cdn.test/p.png', customImageUrl: null })
  })

  it('reads as nothing to write when a lookup failed and none found a URL', async () => {
    lookups({ 'p.png': new Error('storage/unknown'), 't.png': new Error('storage/unknown') })
    await expect(resolveCharacterStoreMediaUrls(stored)).resolves.toBeNull()
    await expect(resolveCharacterStoreMediaUrls({ ...stored, tokenIcon })).resolves.toBeNull()
  })

  it('reads a lookup that found nothing, with none failed, as found', async () => {
    lookups({})
    await expect(resolveCharacterStoreMediaUrls(stored)).resolves.toEqual({ portraitUrl: null, customImageUrl: null })
  })

  it('writes a found URL into the roster, and writes nothing when every lookup failed', async () => {
    lookups({ 'p.png': new Error('storage/unknown'), 't.png': new Error('storage/unknown') })
    const failed = vi.fn()
    renderHook(() => useCharacterStoreMedia([stored], failed))
    await waitFor(() => expect(resolveStoragePathUrl).toHaveBeenCalledTimes(2))
    await Promise.resolve()
    expect(failed).not.toHaveBeenCalled()

    lookups({ 'p.png': 'https://cdn.test/p.png', 't.png': new Error('storage/unknown') })
    const found = vi.fn()
    renderHook(() => useCharacterStoreMedia([stored], found))
    await waitFor(() => expect(found).toHaveBeenCalledTimes(1))
    const update = found.mock.calls[0][0] as (current: typeof stored[]) => typeof stored[]
    expect(update([stored])[0].portraitUrl).toBe('https://cdn.test/p.png')
  })
})

