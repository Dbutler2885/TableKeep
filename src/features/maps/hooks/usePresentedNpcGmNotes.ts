import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { NpcPrivateRecord } from '../../../types/app'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { sceneNpcPrivateDocSegments, toNpcGmNotes } from '../lib/sceneNpcRecord'
import type { NpcSummary } from '../lib/types'

// The presented NPC's GM notes, live. Notes that arrived for an NPC presented
// earlier are never shown for the next one.
export function usePresentedNpcGmNotes(campaignId: string, groupId: string, presentedNpc: NpcSummary | null) {
  const [notes, setNotes] = useState({ npcId: '', gmNotes: '' })
  const npcId = presentedNpc?.id
  useEffect(() => {
    if (!npcId) return
    const unsub = onSnapshot(campaignDocRef(db, { campaignId, groupId }, ...sceneNpcPrivateDocSegments(npcId)), (snap) => {
      const data = snap.data() as Partial<NpcPrivateRecord> | undefined
      setNotes({ npcId, gmNotes: toNpcGmNotes(data) })
    })
    return () => unsub()
  }, [campaignId, groupId, npcId])
  return notes.npcId === npcId ? notes.gmNotes : ''
}
