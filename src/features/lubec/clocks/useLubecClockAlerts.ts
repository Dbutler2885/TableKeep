import { useEffect, useRef, useState } from 'react'
import { onSnapshot } from 'firebase/firestore'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { lubecClockChanges, parseLubecClock } from './lubecClock'
import { enqueueLubecClockAlerts, type LubecClockAlert } from './lubecClockAlertQueue'
import { clocksQuery, type LubecClockReader } from './useLubecClocks'

/**
 * The clock changes to announce to this viewer, one at a time: pieces someone
 * else filled or emptied on a clock this viewer may see. It reads the clocks
 * with the same query as the Clocks tab, so a player never hears of a clock
 * that is not shown to them. A change still waiting on this browser's own
 * write is its own, and is not announced.
 */
export function useLubecClockAlerts({ campaignId, groupId }: CampaignScope, { isGm, userId }: LubecClockReader) {
  const [queue, setQueue] = useState<LubecClockAlert[]>([])
  const seq = useRef(0)
  useEffect(() => {
    let previous: Map<string, number[]> | null = null
    return onSnapshot(clocksQuery({ campaignId, groupId }, { isGm, userId }), (snap) => {
      const readings = snap.docs.map((d) => ({ clock: parseLubecClock(d.data({ serverTimestamps: 'estimate' }), d.id), local: d.metadata.hasPendingWrites }))
      const incoming = lubecClockChanges(previous, readings)
      previous = new Map(readings.map(({ clock }) => [clock.id, clock.filled]))
      if (incoming.length > 0) setQueue((waiting) => enqueueLubecClockAlerts(waiting, incoming, () => ++seq.current))
    }, () => setQueue([]))
  }, [campaignId, groupId, isGm, userId])
  return { current: queue[0] ?? null, dismiss: () => setQueue((waiting) => waiting.slice(1)) }
}
