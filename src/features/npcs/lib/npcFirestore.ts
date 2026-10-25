// Every Firestore read and write the NPC tab makes.
import { deleteDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { NpcRecord, Role } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { campaignCollectionRef, campaignDocRef, npcSheetRef } from '../../campaign/firestorePaths'
import { sanitizeTokenIconForPersistence } from '../../common/mediaFields'
import type { NpcDocumentSnapshot } from './npcRecords'

type DocsListener = (docs: NpcDocumentSnapshot[]) => void

// A player only ever sees the NPCs shown to players.
export function subscribeToNpcs(scope: CampaignScope, role: Role | null, onDocs: DocsListener) {
  const npcsCollection = campaignCollectionRef(db, scope, 'npcs')
  const npcsQuery = role === 'gm'
    ? query(npcsCollection)
    : query(npcsCollection, where('visibleToPlayers', '==', true))
  return onSnapshot(npcsQuery, (snap) => onDocs(snap.docs))
}

export const subscribeToNpcPrivateNotes = (scope: CampaignScope, onDocs: DocsListener) =>
  onSnapshot(campaignCollectionRef(db, scope, 'npcPrivate'), (snap) => onDocs(snap.docs))

// The GM's full write. The portrait URL stays client-side because download
// URLs are bearer tokens; see sanitizeTokenIconForPersistence.
export function writeNpc(scope: CampaignScope, npc: NpcRecord) {
  const { id, tokenIcon, portraitUrl, sortOrder, ...data } = npc
  void portraitUrl
  return setDoc(campaignDocRef(db, scope, 'npcs', id), {
    ...data,
    ...(typeof sortOrder === 'number' ? { sortOrder } : {}),
    tokenIcon: sanitizeTokenIconForPersistence(tokenIcon),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export const writeNpcPrivateNotes = (scope: CampaignScope, npcId: string, gmNotes: string) =>
  setDoc(campaignDocRef(db, scope, 'npcPrivate', npcId), {
    id: npcId,
    gmNotes,
    updatedAt: serverTimestamp(),
  }, { merge: true })

// Only the fields the rules let a player change.
export const writePlayerNpcFields = (scope: CampaignScope, npc: NpcRecord) =>
  setDoc(campaignDocRef(db, scope, 'npcs', npc.id), {
    playerNotes: npc.playerNotes,
    tags: npc.tags,
    portraitPath: npc.portraitPath,
    portraitFocusX: npc.portraitFocusX,
    portraitFocusY: npc.portraitFocusY,
    tokenIcon: sanitizeTokenIconForPersistence(npc.tokenIcon),
    updatedAt: serverTimestamp(),
  }, { merge: true })

export async function createNpcDocuments(scope: CampaignScope, npc: NpcRecord) {
  await setDoc(campaignDocRef(db, scope, 'npcs', npc.id), {
    ...npc,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await setDoc(campaignDocRef(db, scope, 'npcPrivate', npc.id), {
    id: npc.id,
    gmNotes: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

// The NPC goes with its GM notes and its character sheet, if it has one.
export async function deleteNpcDocuments(scope: CampaignScope, npcId: string) {
  await deleteDoc(campaignDocRef(db, scope, 'npcs', npcId))
  await deleteDoc(campaignDocRef(db, scope, 'npcPrivate', npcId))
  await deleteDoc(npcSheetRef(db, scope, npcId))
}
