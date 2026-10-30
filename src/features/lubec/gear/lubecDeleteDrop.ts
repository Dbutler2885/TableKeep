// Deleting a character without losing its things (settled rule 7): one
// Firestore transaction reads the character and its hidden carriers as stored,
// makes each of their things a dropped item in the GM's Items tab, and deletes
// them all, so either everything moves or nothing does. A transaction reads by
// reference, so the hidden carriers are listed before it. The caller sends the
// sheet's waiting save and lets it land first, as for any move between records.

import { getDocs, runTransaction, serverTimestamp, type DocumentSnapshot, type Firestore } from 'firebase/firestore'
import { campaignDocRef, campaignGmItemRef, characterHiddenCarriersRef, type CampaignScope } from '../../campaign/firestorePaths'
import { lubecCarrierGear, type LubecDropper } from '../../ruleSets/lubec/gear/containers'
import { lubecDroppedOnDelete } from '../../ruleSets/lubec/gear/deleteDrop'
import { parseLubecCarrierRecord, parseLubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { stored } from './lubecMoveTransaction'

const hiddenGearOf = (snap: DocumentSnapshot) => lubecCarrierGear(parseLubecCarrierRecord(snap.data(), snap.id))

/**
 * Deletes the character `dropper` names and its hidden carriers, and turns
 * everything they held into dropped items, in one transaction. A character
 * already gone is left alone. Rejects when Firestore refuses, which writes nothing.
 */
export async function lubecDeleteCharacterDroppingGear(db: Firestore, scope: CampaignScope, dropper: LubecDropper): Promise<void> {
  const ref = campaignDocRef(db, scope, 'characters', dropper.characterId)
  const listed = await getDocs(characterHiddenCarriersRef(db, scope, dropper.characterId))
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return
    const hidden = (await Promise.all(listed.docs.map((listedDoc) => tx.get(listedDoc.ref)))).filter((carrier) => carrier.exists())
    const gears = [parseLubecGear(snap.data().lubec?.gear), ...hidden.map(hiddenGearOf)]
    gears.flatMap((gear) => lubecDroppedOnDelete(gear, dropper)).forEach((item) => {
      tx.set(campaignGmItemRef(db, scope, item.id), { ...stored(item), createdAt: serverTimestamp() })
    })
    hidden.forEach((carrier) => tx.delete(carrier.ref))
    tx.delete(ref)
  })
}
