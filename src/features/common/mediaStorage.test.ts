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
  characterUploadAuthority,
  resolveStoragePathUrl,
  sanitizeTokenIconForPersistence,
  uploadAuthorityMetadata,
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

  it('returns a reload-safe URL with a successful upload', async () => {
    const file = { name: 'Connor portrait.png', type: 'image/png' } as File
    const normalizedFile = { name: 'Connor_portrait.webp', type: 'image/webp' } as File
    mocks.normalizeImageForUpload.mockResolvedValueOnce({ file: normalizedFile, width: 600, height: 800 })
    mocks.getDownloadURL.mockResolvedValueOnce('https://firebasestorage.test/uploaded.webp?token=good')
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_700_000_000_000)

    const upload = await uploadEntityImage({
      campaignId: 'campaign',
      groupId: 'group',
      collectionName: 'characters',
      entityId: 'char',
      mediaKind: 'portraits',
      file,
      maxWidth: 600,
      maxHeight: 800,
    })
    expect(upload).toMatchObject({
      path: 'groups/group/campaigns/campaign/characters/char/portraits/1700000000000-Connor_portrait.webp',
      url: 'https://firebasestorage.test/uploaded.webp?token=good',
    })

    await expect(resolveStoragePathUrl(upload.path)).resolves.toBe(upload.url)
    expect(mocks.uploadBytes).toHaveBeenCalledOnce()
    expect(mocks.uploadBytes).toHaveBeenCalledWith(expect.anything(), normalizedFile, { contentType: 'image/webp' })
    expect(mocks.getDownloadURL).toHaveBeenCalledOnce()
  })

  it('sends a claimed upload authority as custom metadata', async () => {
    const normalizedFile = { name: 'owned.webp', type: 'image/webp' } as File
    mocks.normalizeImageForUpload.mockResolvedValueOnce({ file: normalizedFile, width: 600, height: 800 })
    mocks.getDownloadURL.mockResolvedValueOnce('https://firebasestorage.test/owned.webp?token=good')

    await uploadEntityImage({
      campaignId: 'campaign',
      groupId: 'group',
      collectionName: 'characters',
      entityId: 'owned-char',
      mediaKind: 'portraits',
      file: { name: 'owned.png', type: 'image/png' } as File,
      maxWidth: 600,
      maxHeight: 800,
      uploadAuthority: 'owner',
    })

    expect(mocks.uploadBytes).toHaveBeenCalledWith(expect.anything(), normalizedFile, {
      contentType: 'image/webp',
      customMetadata: { uploadAuthority: 'owner' },
    })
  })

  it('claims character ownership only for the owner of an owned character', () => {
    expect(characterUploadAuthority('player-1', 'player-1')).toBe('owner')
    expect(characterUploadAuthority('player-1', 'gm-1')).toBeUndefined()
    expect(characterUploadAuthority('', '')).toBeUndefined()
    expect(uploadAuthorityMetadata(undefined)).toEqual({})
  })

  it('removes bearer token URLs before token icon persistence', () => {
    const persisted = sanitizeTokenIconForPersistence({
      icon: 'custom',
      color: '#ffffff',
      size: 34,
      customImagePath: 'groups/group/campaigns/campaign/npcs/npc/token-icons/token.webp',
      customImageUrl: 'https://firebasestorage.test/token.webp?token=good',
    })
    expect(persisted.customImagePath).toContain('token-icons/token.webp')
    expect(persisted).not.toHaveProperty('customImageUrl')
  })
})
