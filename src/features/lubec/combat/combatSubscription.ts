import { onSnapshot, type DocumentSnapshot, type Firestore } from 'firebase/firestore'
import { campaignDocRef, type CampaignScope } from '../../campaign/firestorePaths'
import type { CombatFight } from './engine/types'

function receiveSnapshot(snapshot: DocumentSnapshot, id: string, receive: (fight: { id: string; fight: CombatFight } | null) => void) {
  receive(snapshot.exists() ? { id, fight: snapshot.data() as CombatFight } : null)
}

/** One control subscription owns the identified fight subscription, including ended documents. */
export function subscribeCombat(db: Firestore, scope: CampaignScope, receive: (fight: { id: string; fight: CombatFight } | null) => void, error: (error: Error) => void) {
  let stopFight: (() => void) | undefined
  const stopControl = onSnapshot(campaignDocRef(db, scope, 'combatControl', 'current'), (control) => {
    stopFight?.()
    const id = control.data()?.activeFightId as string | null | undefined
    if (!id) { receive(null); return }
    stopFight = onSnapshot(campaignDocRef(db, scope, 'combats', id), (snapshot) => {
      receiveSnapshot(snapshot, id, receive)
    }, error)
  }, error)
  return () => { stopControl(); stopFight?.() }
}
