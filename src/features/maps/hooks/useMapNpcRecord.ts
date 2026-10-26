import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { onSnapshot, type DocumentSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { NpcRecord } from '../../../types/app'
import { campaignDocRef, type CampaignScope } from '../../campaign/firestorePaths'
import { resolveNpcMediaUrls } from '../../npcs/lib/npcMediaStorage'
import { applyResolvedMedia, needsMediaUrls, readNpcDocument } from '../../npcs/lib/npcRecords'

type Loaded = { npcId: string; npc: NpcRecord | null }

type SetLoaded = Dispatch<SetStateAction<Loaded | null>>

// The stored NPC, keeping the media URLs already resolved for the same paths; null once it is deleted.
function readNpc(snap: DocumentSnapshot, local: NpcRecord | null) {
  return snap.exists() ? readNpcDocument(snap.id, snap.data() as Partial<NpcRecord>, local ?? undefined) : null
}

const loadedFor = (loaded: Loaded | null, npcId: string) => (loaded?.npcId === npcId ? loaded.npc : null)

// Stored documents carry Storage paths, not URLs. A lookup that finds nothing
// or fails is left for the NPC's next change to retry.
async function resolveMedia(npc: NpcRecord, setLoaded: SetLoaded) {
  const [portraitUrl, customImageUrl] = await resolveNpcMediaUrls(npc)
  if (!portraitUrl && !customImageUrl) return
  setLoaded((loaded) => {
    const current = loadedFor(loaded, npc.id)
    return current ? { npcId: npc.id, npc: applyResolvedMedia([current], npc.id, portraitUrl, customImageUrl)[0] } : loaded
  })
}

/**
 * One NPC of the campaign, kept live, with its portrait and token image ready
 * to show: undefined until it loads, null once it is gone.
 */
export function useMapNpcRecord({ campaignId, groupId }: CampaignScope, npcId: string): NpcRecord | null | undefined {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => onSnapshot(campaignDocRef(db, { campaignId, groupId }, 'npcs', npcId), (snap) => {
    setLoaded((current) => ({ npcId, npc: readNpc(snap, loadedFor(current, npcId)) }))
  }), [campaignId, groupId, npcId])

  const npc = loaded?.npcId === npcId ? loaded.npc : undefined

  useEffect(() => {
    if (npc && needsMediaUrls(npc)) resolveMedia(npc, setLoaded).catch(() => undefined)
  }, [npc])

  return npc
}
