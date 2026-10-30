import { useEffect, useState } from 'react'
import { onSnapshot, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import { campaignSharedCarriersRef, type CampaignScope } from '../../campaign/firestorePaths'
import { parseLubecSharedCarrier, type LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'

type Listened = { key: string; carriers: LubecSharedCarrier[] }

const NONE: readonly LubecSharedCarrier[] = []

const readCarrier = (snap: QueryDocumentSnapshot<DocumentData>) => parseLubecSharedCarrier(snap.data({ serverTimestamps: 'estimate' }), snap.id)

const byName = (a: LubecSharedCarrier, b: LubecSharedCarrier) => a.name.localeCompare(b.name)

/**
 * The campaign's shared carriers, kept in step with Firestore for every member
 * of the group; none until the first read, and none when not `enabled`, as on
 * an NPC's sheet, which has no shared carriers (spec 9.6).
 */
export function useLubecSharedCarriers(scope: CampaignScope, enabled: boolean, setError: (message: string) => void): readonly LubecSharedCarrier[] {
  const { campaignId, groupId } = scope
  const key = `${groupId}/${campaignId}`
  const [listened, setListened] = useState<Listened | null>(null)
  useEffect(() => {
    if (!enabled) return undefined
    return onSnapshot(
      campaignSharedCarriersRef(db, { campaignId, groupId }),
      (snap) => setListened({ key, carriers: snap.docs.map(readCarrier).sort(byName) }),
      () => setError("Could not load the table's shared carriers."),
    )
  }, [key, campaignId, groupId, enabled, setError])
  return enabled && listened?.key === key ? listened.carriers : NONE
}
