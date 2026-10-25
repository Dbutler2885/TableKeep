import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { NpcRecord, Role } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { subscribeToNpcs } from '../lib/npcFirestore'
import { resolveNpcMediaUrls } from '../lib/npcMediaStorage'
import { applyResolvedMedia, needsMediaUrls, readNpcSnapshot } from '../lib/npcRecords'
import type { NpcWriteQueues } from '../lib/npcWriteQueue'
import { isNpcDocumentBusy } from '../lib/npcWriteQueue'

type SetNpcs = Dispatch<SetStateAction<NpcRecord[]>>

async function resolveMediaFor(npc: NpcRecord, setNpcs: SetNpcs) {
  const [portraitUrl, customImageUrl] = await resolveNpcMediaUrls(npc)
  setNpcs((current) => applyResolvedMedia(current, npc.id, portraitUrl, customImageUrl))
}

// Stored documents carry Storage paths, not URLs. A failed lookup is left for
// the next change to the list to retry.
function resolveMissingMedia(npcs: NpcRecord[], setNpcs: SetNpcs) {
  const waiting = npcs.filter(needsMediaUrls)
  if (waiting.length === 0) return
  void Promise.allSettled(waiting.map((npc) => resolveMediaFor(npc, setNpcs)))
}

// The campaign's NPCs as this viewer may see them, kept live.
export function useNpcDocuments({ campaignId, groupId }: CampaignScope, role: Role | null, queues: NpcWriteQueues) {
  const [npcs, setNpcs] = useState<NpcRecord[]>([])
  const npcsRef = useRef<NpcRecord[]>([])

  useEffect(() => {
    npcsRef.current = npcs
  }, [npcs])

  useEffect(() => subscribeToNpcs({ campaignId, groupId }, role, (docs) => {
    setNpcs(readNpcSnapshot(docs, npcsRef.current, (npcId) => isNpcDocumentBusy(queues, npcId)))
  }), [campaignId, groupId, role, queues])

  useEffect(() => resolveMissingMedia(npcs, setNpcs), [npcs])

  return { npcs, setNpcs, npcsRef }
}
