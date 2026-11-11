import { useEffect, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import { campaignClocksRef, type CampaignScope } from '../../campaign/firestorePaths'
import { parseLubecClock, sortLubecClocks, type LubecClock } from './lubecClock'

type Listened = { key: string; clocks: LubecClock[] }

/** A campaign's clocks, oldest first, kept in step with Firestore; null until the first read. */
export function useLubecClocks({ campaignId, groupId }: CampaignScope, setError: (message: string) => void): LubecClock[] | null {
  const key = `${groupId}/${campaignId}`
  const [listened, setListened] = useState<Listened | null>(null)
  useEffect(() => onSnapshot(
    campaignClocksRef(db, { campaignId, groupId }),
    (snap) => setListened({ key, clocks: sortLubecClocks(snap.docs.map((d) => parseLubecClock(d.data({ serverTimestamps: 'estimate' }), d.id))) }),
    () => setError('Could not load the clocks.'),
  ), [key, campaignId, groupId, setError])
  return listened?.key === key ? listened.clocks : null
}
