/** Where an item's picture is filed, under which authority, and what the form gets back. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadEntityImage } from '../../common/mediaStorage'
import { lubecLibraryPictureUpload, lubecSheetPictureUpload } from './lubecItemArt'
import { lubecPickedPicture } from './lubecPicked'
import { lubecShapeOfSize } from './gearArt'

vi.mock('../../common/mediaStorage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../common/mediaStorage')>(),
  uploadEntityImage: vi.fn(),
}))

const uploaded = vi.mocked(uploadEntityImage)
const scope = { campaignId: 'c', groupId: 'g' }
const file = new File(['x'], 'mug.jpg', { type: 'image/jpeg' })
const stored = (width: number, height: number) => ({ path: 'the/path.webp', url: 'https://example.test/secret-token', width, height, name: 'mug' })

beforeEach(() => {
  uploaded.mockReset()
  uploaded.mockResolvedValue(stored(600, 300))
})

describe("an item's picture", () => {
  it('is filed under the character, as its owner, 600 pixels on the long side', async () => {
    await lubecSheetPictureUpload({ scope, characterId: 'char', ownerUserId: 'me', userId: 'me' })(file)
    expect(uploaded).toHaveBeenCalledWith({ ...scope, collectionName: 'characters', entityId: 'char', mediaKind: 'item-art', file, maxWidth: 600, maxHeight: 600, uploadAuthority: 'owner' })
  })

  it('is uploaded with no claim by a GM who does not own the character', async () => {
    await lubecSheetPictureUpload({ scope, characterId: 'char', ownerUserId: 'them', userId: 'gm' })(file)
    expect(uploaded.mock.calls[0][0].uploadAuthority).toBeUndefined()
  })

  it("is filed under the campaign item for the GM's Items tab", async () => {
    await lubecLibraryPictureUpload(scope, 'item')(file)
    expect(uploaded.mock.calls[0][0]).toMatchObject({ collectionName: 'gmItems', entityId: 'item', mediaKind: 'item-art' })
  })

  it('gives the form the path and the shape, and never the URL', async () => {
    expect(await lubecSheetPictureUpload({ scope, characterId: 'char', ownerUserId: 'me', userId: 'me' })(file)).toEqual({ picturePath: 'the/path.webp', shape: 'wide' })
  })
})

describe('the shape an upload starts in', () => {
  it.each([[600, 300, 'wide'], [121, 100, 'wide'], [120, 100, 'square'], [100, 100, 'square'], [83, 100, 'square'], [82, 100, 'tall'], [300, 600, 'tall']])('%i by %i is %s', (w, h, shape) => {
    expect(lubecShapeOfSize(w, h)).toBe(shape)
  })
})

describe('a file the player picked', () => {
  const upload = lubecLibraryPictureUpload(scope, 'item')

  it("says the shape in B's toast", async () => {
    expect(await lubecPickedPicture(upload, file)).toEqual({ ok: true, picture: { picturePath: 'the/path.webp', shape: 'wide' }, toast: 'Picture added. Shape: Wide, from its proportions.' })
  })

  it('refuses a file that is not a picture, without uploading it', async () => {
    expect(await lubecPickedPicture(upload, new File(['x'], 'notes.txt', { type: 'text/plain' }))).toEqual({ ok: false, msg: "That file isn't a picture." })
    expect(uploaded).not.toHaveBeenCalled()
  })

  it('says so when it cannot be read or stored', async () => {
    uploaded.mockRejectedValue(new Error('nope'))
    expect(await lubecPickedPicture(upload, file)).toEqual({ ok: false, msg: "That picture didn't load." })
  })
})
