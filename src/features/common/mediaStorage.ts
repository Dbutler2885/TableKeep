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

export const isRenderableImageUrl = (value: string | null | undefined) =>
  typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:'))

let authReadyPromise: Promise<void> | null = null
const storageUrlCache = new Map<string, Promise<string | null>>()

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
    if (!auth.currentUser) return null
    await auth.currentUser.getIdToken()
    return getDownloadURL(ref(storage, path))
  })()

  storageUrlCache.set(path, pending)
  return pending
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
  const path = groupId
    ? `groups/${groupId}/campaigns/${campaignId}/${collectionName}/${entityId}/${mediaKind}/${Date.now()}-${safeName}`
    : `campaigns/${campaignId}/${collectionName}/${entityId}/${mediaKind}/${Date.now()}-${safeName}`
  const storageRef = ref(storage, path)
  await waitForAuthReady()
  if (!auth.currentUser) {
    throw new Error('You must be signed in to upload images.')
  }
  await auth.currentUser.getIdToken(true)
  await uploadBytes(storageRef, normalized.file, { contentType: normalized.file.type })
  const url = await getDownloadURL(storageRef)
  return {
    path,
    url,
    width: normalized.width,
    height: normalized.height,
    name: file.name.replace(/\.[^/.]+$/, ''),
  }
}

export const sanitizeTokenIconForPersistence = (tokenIcon: TokenIconConfig): TokenIconConfig => {
  const persisted = { ...tokenIcon }
  delete persisted.customImageUrl
  return persisted
}
