import { onSnapshot, orderBy, query, type Firestore, type Timestamp } from 'firebase/firestore'
import { campaignCollectionRef, type CampaignScope } from '../../campaign/firestorePaths'
import type { CombatLog } from './engine/combatFeedback'

export type CombatLogEntry = CombatLog & { id: string; at: Timestamp | null; ordinal?: number }
export type CombatLogUpdate = { entries: CombatLogEntry[]; arriving: CombatLogEntry[] }

const logOrder = (a: CombatLogEntry, b: CombatLogEntry) =>
  (a.at!.toMillis() - b.at!.toMillis()) || ((a.ordinal ?? 0) - (b.ordinal ?? 0)) || a.id.localeCompare(b.id)

/** The initial server snapshot is history. Local writes become cards only after acknowledgement. */
export function subscribeCombatLog(db: Firestore, scope: CampaignScope, fightId: string, receive: (update: CombatLogUpdate) => void, error: (error: Error) => void) {
  const seen = new Set<string>()
  let attached = false
  const ref = query(campaignCollectionRef(db, scope, 'combats', fightId, 'log'), orderBy('at'))
  return onSnapshot(ref, { includeMetadataChanges: true }, (snapshot) => {
    const committed = snapshot.docs.filter((doc) => !doc.metadata.hasPendingWrites)
    const entries = committed.map((doc) => ({ ...doc.data(), id: doc.id }) as CombatLogEntry).filter((entry) => entry.at != null).sort(logOrder)
    const arriving = attached ? entries.filter((entry) => !seen.has(entry.id)) : []
    entries.forEach((entry) => seen.add(entry.id))
    if (!snapshot.metadata.fromCache) attached = true
    receive({ entries, arriving })
  }, error)
}

export function combatLogText(entry: CombatLogEntry): string {
  const roll = entry.roll
  if (!roll) return entry.event
  return `${roll.who} - ${roll.what}: ${roll.roll} ${roll.target}. ${roll.result}.${roll.extra ? ` ${roll.extra}` : ''}`
}

export const combatLogTime = (entry: CombatLogEntry): string =>
  (entry.at ? entry.at.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '')
