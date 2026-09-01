import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authStateReady: vi.fn(async () => undefined),
  getIdToken: vi.fn(async () => 'id-token'),
  getDownloadURL: vi.fn(),
  normalizeImageForUpload: vi.fn(),
  ref: vi.fn((_storage: unknown, path: string) => ({ fullPath: path })),
  uploadBytes: vi.fn(async () => undefined),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  getDownloadURL: mocks.getDownloadURL,
  ref: mocks.ref,
  uploadBytes: mocks.uploadBytes,
}))

vi.mock('../../firebase', () => ({
  auth: {
    authStateReady: mocks.authStateReady,
    currentUser: { getIdToken: mocks.getIdToken },
  },
  storage: {},
}))

vi.mock('./imageNormalization', () => ({
  normalizeImageForUpload: mocks.normalizeImageForUpload,
}))

import {
  entityMediaForPersistence,
  resolveStoragePathUrl,
  sanitizeTokenIconForPersistence,
  uploadEntityImage,
} from './mediaStorage'

describe('entity media storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refreshes authentication and retries an unauthorized download URL lookup', async () => {
    mocks.getDownloadURL
      .mockRejectedValueOnce({ code: 'storage/unauthorized' })
      .mockResolvedValueOnce('https://firebasestorage.test/portrait.webp?token=good')

    await expect(resolveStoragePathUrl('groups/group/campaigns/campaign/characters/char/portraits/retry.webp'))
      .resolves.toBe('https://firebasestorage.test/portrait.webp?token=good')

    expect(mocks.getDownloadURL).toHaveBeenCalledTimes(2)
    expect(mocks.getIdToken).toHaveBeenNthCalledWith(1)
    expect(mocks.getIdToken).toHaveBeenNthCalledWith(2, true)
  })

  it('does not permanently cache a failed path lookup', async () => {
    const path = 'groups/group/campaigns/campaign/npcs/npc/portraits/recover.webp'
    mocks.getDownloadURL.mockRejectedValueOnce({ code: 'storage/object-not-found' })

    await expect(resolveStoragePathUrl(path)).rejects.toEqual({ code: 'storage/object-not-found' })

    mocks.getDownloadURL.mockResolvedValueOnce('https://firebasestorage.test/recover.webp?token=good')
    await expect(resolveStoragePathUrl(path)).resolves.toBe('https://firebasestorage.test/recover.webp?token=good')
    expect(mocks.getDownloadURL).toHaveBeenCalledTimes(2)
  })

  it('persists reload-safe character and NPC media URLs but drops local data URLs', () => {
    const portraitUrl = 'https://firebasestorage.test/portrait.webp?token=good'
    const tokenUrl = 'https://firebasestorage.test/token.webp?token=good'

    expect(entityMediaForPersistence({
      portraitPath: 'groups/group/campaigns/campaign/characters/char/portraits/portrait.webp',
      portraitUrl,
      tokenIcon: {
        icon: 'custom',
        color: '#ffffff',
        size: 34,
        customImagePath: 'groups/group/campaigns/campaign/characters/char/token-icons/token.webp',
        customImageUrl: tokenUrl,
      },
    })).toMatchObject({
      portraitUrl,
      tokenIcon: { customImageUrl: tokenUrl },
    })

    const localPreview = entityMediaForPersistence({
      portraitPath: 'groups/group/campaigns/campaign/npcs/npc/portraits/portrait.webp',
      portraitUrl: 'data:image/webp;base64,preview',
      tokenIcon: {
        icon: 'custom',
        color: '#ffffff',
        size: 34,
        customImageUrl: 'data:image/webp;base64,preview',
      },
    })
    expect(localPreview.portraitUrl).toBeNull()
    expect(localPreview.tokenIcon).not.toHaveProperty('customImageUrl')
  })

  it('returns a reload-safe URL with a successful upload', async () => {
    const file = { name: 'Connor portrait.png', type: 'image/png' } as File
    const normalizedFile = { name: 'Connor_portrait.webp', type: 'image/webp' } as File
    mocks.normalizeImageForUpload.mockResolvedValueOnce({ file: normalizedFile, width: 600, height: 800 })
    mocks.getDownloadURL.mockResolvedValueOnce('https://firebasestorage.test/uploaded.webp?token=good')
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_700_000_000_000)

    await expect(uploadEntityImage({
      campaignId: 'campaign',
      groupId: 'group',
      collectionName: 'characters',
      entityId: 'char',
      mediaKind: 'portraits',
      file,
      maxWidth: 600,
      maxHeight: 800,
    })).resolves.toMatchObject({
      path: 'groups/group/campaigns/campaign/characters/char/portraits/1700000000000-Connor_portrait.webp',
      url: 'https://firebasestorage.test/uploaded.webp?token=good',
    })

    expect(mocks.uploadBytes).toHaveBeenCalledOnce()
  })

  it('keeps persisted token URLs shared by character and NPC writers', () => {
    expect(sanitizeTokenIconForPersistence({
      icon: 'custom',
      color: '#ffffff',
      size: 34,
      customImageUrl: 'https://firebasestorage.test/token.webp?token=good',
    }).customImageUrl).toContain('token=good')
  })
})
