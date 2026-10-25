import { useEffect, useRef, useState } from 'react'
import type { Role } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { subscribeToNpcPrivateNotes } from '../lib/npcFirestore'
import { readPrivateNotes } from '../lib/npcRecords'
import type { NpcWriteQueues } from '../lib/npcWriteQueue'

// The GM's private notes by NPC id. Only the GM reads them; the notes are
// dropped as soon as the viewer stops being the GM.
export function useNpcPrivateNotes({ campaignId, groupId }: CampaignScope, role: Role | null, queues: NpcWriteQueues) {
  const [privateNotesById, setPrivateNotesById] = useState<Record<string, string>>({})
  const privateNotesRef = useRef<Record<string, string>>({})

  useEffect(() => {
    privateNotesRef.current = privateNotesById
  }, [privateNotesById])

  useEffect(() => {
    if (role !== 'gm') return undefined
    const unsubscribe = subscribeToNpcPrivateNotes({ campaignId, groupId }, (docs) => {
      setPrivateNotesById(readPrivateNotes(docs, privateNotesRef.current, (npcId) => queues.private.isBusy(npcId)))
    })
    return () => {
      unsubscribe()
      setPrivateNotesById({})
    }
  }, [campaignId, groupId, role, queues])

  return { privateNotesById, setPrivateNotesById, privateNotesRef }
}
