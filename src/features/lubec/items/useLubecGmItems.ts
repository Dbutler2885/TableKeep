import { useEffect, useState } from 'react'
import { onSnapshot, query, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '../../../firebase'
import { campaignGmItemsRef, type CampaignScope } from '../../campaign/firestorePaths'
import { parseLubecGmItem, type LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'

/** Which of the tab's items to read: all of them, which only the GM may, or the campaign items every member may. */
export type LubecGmItemsReach = 'all' | 'library'

type Listened = { key: string; items: LubecGmItem[] }

const readItem = (snap: QueryDocumentSnapshot<DocumentData>) => parseLubecGmItem(snap.data({ serverTimestamps: 'estimate' }), snap.id)

// A member's list must carry the status filter, or the rules cannot prove the query and refuse it.
const gmItemsQuery = (scope: CampaignScope, reach: LubecGmItemsReach) => {
  const all = campaignGmItemsRef(db, scope)
  return reach === 'all' ? all : query(all, where('status', '==', 'library'))
}

/**
 * The GM Items tab's items in a campaign, kept in step with Firestore; null
 * until the first read.
 */
export function useLubecGmItems({ campaignId, groupId }: CampaignScope, reach: LubecGmItemsReach, setError: (message: string) => void): LubecGmItem[] | null {
  const key = `${groupId}/${campaignId}/${reach}`
  const [listened, setListened] = useState<Listened | null>(null)
  useEffect(() => onSnapshot(
    gmItemsQuery({ campaignId, groupId }, reach),
    (snap) => setListened({ key, items: snap.docs.map(readItem) }),
    () => setError('Could not load the campaign\'s items.'),
  ), [key, campaignId, groupId, reach, setError])
  return listened?.key === key ? listened.items : null
}
