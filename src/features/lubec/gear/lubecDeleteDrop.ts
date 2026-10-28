// Deleting a character without losing its things (settled rule 7): one
// Firestore transaction reads the character as stored, makes each of its
// things a dropped item in the GM's Items tab, and deletes the character, so
// either everything moves or nothing does. The caller sends the sheet's
// waiting save and lets it land first, as for any move between records.

import { runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore'
import { campaignDocRef, campaignGmItemRef, type CampaignScope } from '../../campaign/firestorePaths'
import type { LubecDropper } from '../../ruleSets/lubec/gear/containers'
import { lubecDroppedOnDelete } from '../../ruleSets/lubec/gear/deleteDrop'
import { parseLubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { stored } from './lubecMoveTransaction'

/**
 * Deletes the character `dropper` names and turns everything it had into
 * dropped items, in one transaction. A character already gone is left alone.
 * Rejects when Firestore refuses, which writes nothing.
 */
export async function lubecDeleteCharacterDroppingGear(db: Firestore, scope: CampaignScope, dropper: LubecDropper): Promise<void> {
  const ref = campaignDocRef(db, scope, 'characters', dropper.characterId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    lubecDroppedOnDelete(parseLubecGear(snap.data().lubec?.gear), dropper).forEach((item) => {
      tx.set(campaignGmItemRef(db, scope, item.id), { ...stored(item), createdAt: serverTimestamp() })
    })
    tx.delete(ref)
  })
}
