import { onAuthStateChanged } from 'firebase/auth'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from '../../firebase'
import { normalizeImageForUpload } from './imageNormalization'
import type { TokenIconConfig } from '../tokens/TokenIconEditor'

type UploadEntityImageParams = {
  campaignId: string
  groupId: string
  collectionName: 'characters' | 'npcs' | 'monsters' | 'items'
  entityId: string
  mediaKind: 'portraits' | 'token-icons'
  file: File
  maxWidth: number
  maxHeight: number
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

export const isRenderableImageUrl = (value: string | null | undefined) =>
  typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:'))

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

export const resolveStoragePathUrl = async (path: string) => {
  if (!path) return null
  const cached = storageUrlCache.get(path)
  if (cached) return cached

  const pending = (async () => {
    await waitForAuthReady()
    const user = auth.currentUser
    if (!user) throw new Error('You must be signed in to load images.')

    await user.getIdToken()
    try {
      return await getDownloadURL(ref(storage, path))
    } catch (error) {
      if (!isRetryableAuthError(error)) throw error
      await user.getIdToken(true)
      return getDownloadURL(ref(storage, path))
    }
  })()

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
  await uploadBytes(storageRef, normalized.file, { contentType: normalized.file.type })
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

export const isPersistableMediaUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))

export const sanitizeTokenIconForPersistence = (tokenIcon: TokenIconConfig): TokenIconConfig => {
  const persisted = { ...tokenIcon }
  if (!isPersistableMediaUrl(persisted.customImageUrl)) delete persisted.customImageUrl
  return persisted
}

export const entityMediaForPersistence = ({
  portraitPath,
  portraitUrl,
  tokenIcon,
}: {
  portraitPath?: string
  portraitUrl?: string | null
  tokenIcon: TokenIconConfig
}) => ({
  portraitPath: portraitPath ?? '',
  portraitUrl: isPersistableMediaUrl(portraitUrl) ? portraitUrl : null,
  tokenIcon: sanitizeTokenIconForPersistence(tokenIcon),
})
