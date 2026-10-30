// An item's own picture, copied from the inventory prototype's `pic-file`
// handler (B). B kept an upload as a data URL; here it goes to Storage, and the
// item keeps only the path (spec 3.3 and 4.6). A hidden thing is offered no
// upload, because a Storage rule for "the owner or the GM" costs three reads.

import type { CampaignScope } from '../../campaign/firestorePaths'
import { characterUploadAuthority, uploadEntityImage } from '../../common/mediaStorage'
import { lubecShapeOfSize } from './gearArt'
import type { LubecPictureUpload } from './lubecPicked'

// A phone photo stays small: 600 pixels on the long side, as in B.
const LONG_SIDE = 600

type Filed = Pick<Parameters<typeof uploadEntityImage>[0], 'collectionName' | 'entityId' | 'uploadAuthority'>

const uploadUnder = (scope: CampaignScope, filed: Filed): LubecPictureUpload => async (file) => {
  const { path, width, height } = await uploadEntityImage({ ...scope, ...filed, mediaKind: 'item-art', file, maxWidth: LONG_SIDE, maxHeight: LONG_SIDE })
  return { picturePath: path, shape: lubecShapeOfSize(width, height) }
}

type SheetArt = { scope: CampaignScope; characterId: string; ownerUserId: string; userId: string }

/** A picture for a thing on a character: as its owner when the viewer owns it, and as the GM otherwise. */
export const lubecSheetPictureUpload = ({ scope, characterId, ownerUserId, userId }: SheetArt): LubecPictureUpload =>
  uploadUnder(scope, { collectionName: 'characters', entityId: characterId, uploadAuthority: characterUploadAuthority(ownerUserId, userId) })

/** A picture for a campaign item in the GM's Items tab. */
export const lubecLibraryPictureUpload = (scope: CampaignScope, itemId: string): LubecPictureUpload =>
  uploadUnder(scope, { collectionName: 'gmItems', entityId: itemId })
