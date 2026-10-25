import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'

const mocks = vi.hoisted(() => ({
  normalizeImageForUpload: vi.fn(async (file: File) => ({ file })),
  uploadEntityImage: vi.fn(async (..._args: unknown[]) => ({ path: 'uploaded/portrait.webp', url: 'https://media.test/uploaded/portrait.webp' })),
}))

vi.mock('../common/imageNormalization', () => ({ normalizeImageForUpload: mocks.normalizeImageForUpload }))
vi.mock('../common/mediaStorage', () => ({ uploadEntityImage: mocks.uploadEntityImage }))

const { importLubecCharacter } = await import('./lubecImport')
const { LUBEC_UNREADABLE_PORTRAIT_NOTE, readLubecCharacterFile } = await import('../ruleSets/lubec/importFile')

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

function importedWith(portrait: unknown) {
  const reading = readLubecCharacterFile(JSON.stringify({ format: 'lubec-character', version: 1, characterName: 'Tommy', portrait }))
  if (!('imported' in reading)) throw new Error(reading.refused)
  return reading.imported
}

function importContext() {
  const created: LubecCharacterRecord[] = []
  return {
    created,
    context: {
      campaignId: 'campaign-1',
      groupId: 'group-1',
      owner: { userId: 'player-1', username: 'tommyev' },
      addCharacter: vi.fn(async (character: LubecCharacterRecord) => { created.push(character) }),
      updateCharacter: vi.fn(),
      setError: vi.fn(),
    },
  }
}

describe('importing a Lubec character', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates the character first, then uploads the decoded portrait as its owner and stores the returned path', async () => {
    const { context, created } = importContext()

    await importLubecCharacter(context, importedWith(PNG_DATA_URL))

    const [character] = created
    expect(character).toMatchObject({ name: 'Tommy', portraitPath: '', lubec: { door: 'import', importNotes: [] } })
    expect(mocks.uploadEntityImage).toHaveBeenCalledWith(expect.objectContaining({
      campaignId: 'campaign-1', groupId: 'group-1', collectionName: 'characters', entityId: character.id, mediaKind: 'portraits', uploadAuthority: 'owner',
    }))
    expect(context.addCharacter.mock.invocationCallOrder[0]).toBeLessThan(mocks.uploadEntityImage.mock.invocationCallOrder[0])
    expect(context.updateCharacter).toHaveBeenCalledWith(character.id, {
      portraitPath: 'uploaded/portrait.webp', portraitUrl: 'https://media.test/uploaded/portrait.webp',
    })
  })

  it('notes a portrait that does not decode as an image, and uploads nothing', async () => {
    mocks.normalizeImageForUpload.mockRejectedValueOnce(new Error('Unable to load image'))
    const { context, created } = importContext()

    await importLubecCharacter(context, importedWith(PNG_DATA_URL))

    expect(created[0].lubec.importNotes).toEqual([LUBEC_UNREADABLE_PORTRAIT_NOTE])
    expect(mocks.uploadEntityImage).not.toHaveBeenCalled()
    expect(context.updateCharacter).not.toHaveBeenCalled()
  })

  it('keeps the character without a portrait and reports the error when the upload fails', async () => {
    mocks.uploadEntityImage.mockRejectedValueOnce(new Error('You must be signed in to upload images.'))
    const { context, created } = importContext()

    await importLubecCharacter(context, importedWith(PNG_DATA_URL))

    expect(created).toHaveLength(1)
    expect(context.updateCharacter).not.toHaveBeenCalled()
    expect(context.setError).toHaveBeenCalledWith('You must be signed in to upload images.')
  })

  it('creates a character with no portrait without decoding or uploading anything', async () => {
    const { context, created } = importContext()

    await importLubecCharacter(context, importedWith(null))

    expect(created).toHaveLength(1)
    expect(mocks.normalizeImageForUpload).not.toHaveBeenCalled()
    expect(mocks.uploadEntityImage).not.toHaveBeenCalled()
  })
})
