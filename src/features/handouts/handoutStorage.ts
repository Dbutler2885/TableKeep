import { deleteObject, getBlob, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from '../../firebase'
import type { CampaignScope } from '../campaign/firestorePaths'
import { handoutFileKind, MAX_HANDOUT_BYTES } from './handoutModel'

export async function uploadHandoutFile(scope: CampaignScope, handoutId: string, file: File) {
  const kind = handoutFileKind(file)
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Sign in to upload a handout.')
  await auth.currentUser.getIdToken(true)
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `groups/${scope.groupId}/campaigns/${scope.campaignId}/handouts/${handoutId}/${crypto.randomUUID()}-${safeName}`
  await uploadBytes(ref(storage, path), file, { contentType: file.type })
  return { kind, storagePath: path, fileName: file.name }
}

// Authenticated bytes, never a cached bearer download URL: each new view checks the rules.
export async function loadHandoutFile(path: string) {
  await auth.authStateReady()
  if (!auth.currentUser) throw new Error('Sign in to view this handout.')
  await auth.currentUser.getIdToken()
  return getBlob(ref(storage, path), MAX_HANDOUT_BYTES)
}

export async function removeHandoutFile(path: string) {
  if (!path) return
  try {
    await deleteObject(ref(storage, path))
  } catch (error) {
    if ((error as { code?: string }).code !== 'storage/object-not-found') throw error
  }
}
