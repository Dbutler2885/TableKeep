import { useEffect, useState } from 'react'
import { onSnapshot, or, query, where } from 'firebase/firestore'
import { db } from '../../../firebase'
import { campaignClocksRef, campaignCollectionRef, type CampaignScope } from '../../campaign/firestorePaths'
import { parseLubecClock, sortLubecClocks, type LubecClock, type LubecClockCharacter } from './lubecClock'

type Listened<T> = { key: string; value: T }

/** Who is reading: the GM reads every clock, anyone else only the clocks shown to them. */
export type LubecClockReader = { isGm: boolean; userId: string }

// A player's list must carry the visibility filter, or the rules cannot prove the query and refuse it.
export const clocksQuery = (scope: CampaignScope, { isGm, userId }: LubecClockReader) => {
  const all = campaignClocksRef(db, scope)
  return isGm ? all : query(all, or(where('visibility', '==', 'all'), where('viewerUids', 'array-contains', userId)))
}

/** The campaign's clocks this reader may see, oldest first, kept in step with Firestore; null until the first read. */
export function useLubecClocks({ campaignId, groupId }: CampaignScope, { isGm, userId }: LubecClockReader, setError: (message: string) => void): LubecClock[] | null {
  const key = `${groupId}/${campaignId}/${isGm}/${userId}`
  const [listened, setListened] = useState<Listened<LubecClock[]> | null>(null)
  useEffect(() => onSnapshot(
    clocksQuery({ campaignId, groupId }, { isGm, userId }),
    (snap) => setListened({ key, value: sortLubecClocks(snap.docs.map((d) => parseLubecClock(d.data({ serverTimestamps: 'estimate' }), d.id))) }),
    () => setError('Could not load the clocks.'),
  ), [key, campaignId, groupId, isGm, userId, setError])
  return listened?.key === key ? listened.value : null
}

const readCharacter = (id: string, data: Record<string, unknown>): LubecClockCharacter => ({
  id,
  name: typeof data.name === 'string' && data.name ? data.name : 'Unnamed kid',
  ownerUserId: typeof data.ownerUserId === 'string' ? data.ownerUserId : '',
  ownerUsername: typeof data.ownerUsername === 'string' ? data.ownerUsername : '',
})

/**
 * The players' characters the GM can show a clock to: every character in the
 * campaign that someone other than the GM owns. Only the GM listens; for
 * anyone else it stays empty.
 */
export function useLubecClockCharacters({ campaignId, groupId }: CampaignScope, isGm: boolean, gmUserId: string): LubecClockCharacter[] {
  const key = `${groupId}/${campaignId}/${gmUserId}`
  const [listened, setListened] = useState<Listened<LubecClockCharacter[]> | null>(null)
  useEffect(() => {
    if (!isGm) return undefined
    return onSnapshot(campaignCollectionRef(db, { campaignId, groupId }, 'characters'), (snap) => setListened({
      key,
      value: snap.docs.map((d) => readCharacter(d.id, d.data())).filter((character) => character.ownerUserId && character.ownerUserId !== gmUserId),
    }))
  }, [key, campaignId, groupId, isGm, gmUserId])
  return isGm && listened?.key === key ? listened.value : []
}
