import { useEffect, useState } from 'react'
import { deleteDoc, onSnapshot, or, query, setDoc, where } from 'firebase/firestore'
import { db } from '../../firebase'
import { campaignCollectionRef, campaignDocRef, type CampaignScope } from '../campaign/firestorePaths'
import type { Handout, HandoutCharacter, HandoutFolder } from './handoutModel'
import { removeHandoutFile, uploadHandoutFile } from './handoutStorage'

export function useHandouts(scope: CampaignScope, isGm: boolean, userId: string) {
  const { groupId, campaignId } = scope
  const [handouts, setHandouts] = useState<Handout[]>([])
  const [folders, setFolders] = useState<HandoutFolder[]>([])
  const [characters, setCharacters] = useState<HandoutCharacter[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const currentScope = { groupId, campaignId }
    const all = campaignCollectionRef(db, currentScope, 'handouts')
    const source = isGm ? all : query(all, or(where('visibility', '==', 'all'), where('viewerUids', 'array-contains', userId)))
    const failed = (reason: Error) => { setHandouts([]); setError(reason.message); setLoading(false) }
    const stopHandouts = onSnapshot(source, (snapshot) => {
      setHandouts(snapshot.docs.map((record) => ({ ...record.data(), id: record.id }) as Handout))
      setLoading(false)
    }, failed)
    const stopFolders = onSnapshot(campaignCollectionRef(db, currentScope, 'handoutFolders'), (snapshot) => {
      setFolders(snapshot.docs.map((record) => ({ ...record.data(), id: record.id }) as HandoutFolder))
    }, failed)
    const stopCharacters = isGm ? onSnapshot(campaignCollectionRef(db, currentScope, 'characters'), (snapshot) => {
      setCharacters(snapshot.docs.map((record) => ({ id: record.id, name: record.data().name || 'Unnamed character', ownerUserId: record.data().ownerUserId || '' })))
    }, failed) : () => {}
    return () => { stopHandouts(); stopFolders(); stopCharacters() }
  }, [campaignId, groupId, isGm, userId])
  return { handouts, folders, characters, error, loading, setError }
}

export async function saveHandout(scope: CampaignScope, handout: Handout, file: File | null) {
  const uploaded = file ? await uploadHandoutFile(scope, handout.id, file) : null
  const saved = { ...handout, ...uploaded }
  if (saved.kind === 'text') { saved.storagePath = ''; saved.fileName = '' }
  else saved.text = ''
  const { id, ...data } = saved
  try {
    await setDoc(campaignDocRef(db, scope, 'handouts', id), data)
  } catch (error) {
    if (uploaded) await removeHandoutFile(uploaded.storagePath)
    throw error
  }
  if (handout.storagePath && handout.storagePath !== saved.storagePath) await removeHandoutFile(handout.storagePath)
  return saved
}

export async function deleteHandout(scope: CampaignScope, handout: Handout) {
  await deleteDoc(campaignDocRef(db, scope, 'handouts', handout.id))
  await removeHandoutFile(handout.storagePath)
}

export async function saveHandoutFolder(scope: CampaignScope, folder: HandoutFolder) {
  const { id, ...data } = folder
  await setDoc(campaignDocRef(db, scope, 'handoutFolders', id), data)
}

export async function deleteHandoutFolder(scope: CampaignScope, folderId: string) {
  await deleteDoc(campaignDocRef(db, scope, 'handoutFolders', folderId))
}
