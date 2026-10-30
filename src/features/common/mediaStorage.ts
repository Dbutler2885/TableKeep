import { onAuthStateChanged, type User } from 'firebase/auth'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from '../../firebase'
import { normalizeImageForUpload } from './imageNormalization'

export { isRenderableImageUrl, sanitizeTokenIconForPersistence } from './mediaFields'

/**
 * The authority a non-GM upload acts under, sent as the object's
 * `uploadAuthority` custom metadata.
 *
 * Production Storage rules may read at most two Firestore documents per request,
 * and proving "campaign GM" already costs two, so `storage.rules` cannot try the
 * GM check and then fall back to an ownership check. It evaluates the one branch
 * the upload names instead. Omit it to be held to the GM check.
 */
export type UploadAuthority = 'owner' | 'player'

/** A character's art is uploaded as its owner when the uploader owns it, and as the GM otherwise. */
export const characterUploadAuthority = (ownerUserId: string, currentUserId: string): UploadAuthority | undefined =>
  ownerUserId && ownerUserId === currentUserId ? 'owner' : undefined

export const uploadAuthorityMetadata = (uploadAuthority: UploadAuthority | undefined) =>
  uploadAuthority ? { customMetadata: { uploadAuthority } } : {}

type UploadEntityImageParams = {
  campaignId: string
  groupId: string
  collectionName: 'characters' | 'npcs' | 'monsters' | 'items' | 'gmItems'
  entityId: string
  mediaKind: 'portraits' | 'token-icons' | 'item-art'
  file: File
  maxWidth: number
  maxHeight: number
  uploadAuthority?: UploadAuthority
}

export const entityMediaStoragePath = ({ groupId, campaignId, collectionName, entityId, mediaKind, fileName, timestamp }: {
  groupId: string
  campaignId: string
  collectionName: UploadEntityImageParams['collectionName']
  entityId: string
  mediaKind: UploadEntityImageParams['mediaKind']
  fileName: string
  timestamp: number
}) => groupId
  ? `groups/${groupId}/campaigns/${campaignId}/${collectionName}/${entityId}/${mediaKind}/${timestamp}-${fileName}`
  : `campaigns/${campaignId}/${collectionName}/${entityId}/${mediaKind}/${timestamp}-${fileName}`


let authReadyPromise: Promise<void> | null = null
const storageUrlCache = new Map<string, Promise<string | null>>()

const storageErrorCode = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : ''

const isRetryableAuthError = (error: unknown) => {
  const code = storageErrorCode(error)
  return code === 'storage/unauthenticated' || code === 'storage/unauthorized'
}

const waitForAuthReady = async () => {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady()
    return
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise<void>((resolve) => {
      const unsub = onAuthStateChanged(auth, () => {
        unsub()
        resolve()
      })
    })
  }

  await authReadyPromise
}

// One lookup; an authorization failure is tried once more with a refreshed ID token.
async function downloadUrlRefreshingAuth(user: User, path: string) {
  try {
    return await getDownloadURL(ref(storage, path))
  } catch (error) {
    if (!isRetryableAuthError(error)) throw error
    await user.getIdToken(true)
    return getDownloadURL(ref(storage, path))
  }
}

// A failed lookup is evicted, but nothing asks for that path again until its
// record changes, so one passing failure would leave the image blank for the
// session. A lookup is tried again after each of these waits, about six seconds
// in all; only a missing object is final at once.
const LOOKUP_RETRY_DELAYS_MS = [500, 1500, 4000]

const isMissingObject = (error: unknown) => storageErrorCode(error) === 'storage/object-not-found'

const pause = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms) })

async function downloadUrlWithRetries(user: User, path: string) {
  for (const delay of LOOKUP_RETRY_DELAYS_MS) {
    try {
      return await downloadUrlRefreshingAuth(user, path)
    } catch (error) {
      if (isMissingObject(error)) throw error
      await pause(delay)
    }
  }
  return downloadUrlRefreshingAuth(user, path)
}

// A lookup as the signed-in user, once the session has been restored.
async function lookUpDownloadUrl(path: string) {
  await waitForAuthReady()
  const user = auth.currentUser
  if (!user) throw new Error('You must be signed in to load images.')

  await user.getIdToken()
  return downloadUrlWithRetries(user, path)
}

export const resolveStoragePathUrl = async (path: string) => {
  if (!path) return null
  const cached = storageUrlCache.get(path)
  if (cached) return cached

  const pending = lookUpDownloadUrl(path)
  storageUrlCache.set(path, pending)
  try {
    return await pending
  } catch (error) {
    if (storageUrlCache.get(path) === pending) storageUrlCache.delete(path)
    throw error
  }
}

export const uploadEntityImage = async ({
  campaignId,
  groupId,
  collectionName,
  entityId,
  mediaKind,
  file,
  maxWidth,
  maxHeight,
  uploadAuthority,
}: UploadEntityImageParams) => {
  const normalized = await normalizeImageForUpload(file, {
    maxWidth,
    maxHeight,
    preferType: 'image/webp',
    quality: 0.9,
  })
  const safeName = normalized.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = entityMediaStoragePath({ groupId, campaignId, collectionName, entityId, mediaKind, fileName: safeName, timestamp: Date.now() })
  const storageRef = ref(storage, path)
  await waitForAuthReady()
  if (!auth.currentUser) {
    throw new Error('You must be signed in to upload images.')
  }
  await auth.currentUser.getIdToken(true)
  await uploadBytes(storageRef, normalized.file, { contentType: normalized.file.type, ...uploadAuthorityMetadata(uploadAuthority) })
  const url = await resolveStoragePathUrl(path)
  if (!url) throw new Error('Unable to resolve the uploaded image.')
  return {
    path,
    url,
    width: normalized.width,
    height: normalized.height,
    name: file.name.replace(/\.[^/.]+$/, ''),
  }
}
