// What writes a hidden carrier (spec 4.4 and 4.7). A change inside one is a
// transaction on its own document. A move in or out of one is `lubecMoveBetween`,
// through `lubecGearWork`, and nothing here touches the character's document.

import { runTransaction, serverTimestamp, setDoc, type DocumentData, type Firestore } from 'firebase/firestore'
import { characterHiddenCarrierRef, type CampaignScope } from '../../campaign/firestorePaths'
import { LUBEC_STALE_MOVE } from '../../ruleSets/lubec/gear/containers'
import { parseLubecCarrierRecord, type LubecCarrier, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecHiddenCarrier } from '../../ruleSets/lubec/gear/hiddenCarrier'
import { lubecGearDrop, type LubecGearDrop, type LubecGearDropper, type LubecGearDropStore } from './lubecGearDrop'
import { stored, type LubecMoveResult } from './lubecMoveTransaction'

/** A character's hidden carriers, for a viewer who may see them: its owner and the GM. */
export type LubecGearHidden = {
  db: Firestore
  scope: CampaignScope
  characterId: string
  store: LubecGearDropStore
  dropper: LubecGearDropper
}

const refOf = ({ db, scope, characterId }: LubecGearHidden, carrierId: string) => characterHiddenCarrierRef(db, scope, characterId, carrierId)

/** Writes a new hidden carrier, empty. */
export function lubecAddHiddenCarrier(hidden: LubecGearHidden, carrier: LubecCarrier): Promise<void> {
  return setDoc(refOf(hidden, carrier.id), { ...stored(carrier), items: [], updatedAt: serverTimestamp() })
}

const sameItems = (data: DocumentData, carrier: LubecHiddenCarrier) =>
  JSON.stringify(parseLubecCarrierRecord(data, carrier.id).items) === JSON.stringify(carrier.items)

/**
 * Saves a change inside one hidden carrier, in a transaction: the items become
 * `items` if the carrier is still as the page showed it. The GM may be in it
 * too, so one that has changed is refused, and nothing is written.
 */
export function lubecSaveHiddenItems(hidden: LubecGearHidden, carrier: LubecHiddenCarrier, items: readonly LubecItem[]): Promise<LubecMoveResult> {
  const ref = refOf(hidden, carrier.id)
  return runTransaction(hidden.db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists() || !sameItems(snap.data(), carrier)) return { ok: false, msg: LUBEC_STALE_MOVE }
    tx.set(ref, { items: stored(items), updatedAt: serverTimestamp() }, { merge: true })
    return { ok: true }
  })
}

/** The drop of a thing in hidden carrier `carrierId`: it goes to the GM's Items tab with where it was, as any drop does (spec 14.1, R4). */
export const lubecHiddenDrop = ({ db, scope, characterId, store, dropper }: LubecGearHidden, carrierId: string): Exclude<LubecGearDrop, null> =>
  lubecGearDrop({ db, scope, sheet: { kind: 'hidden', characterId, carrierId } }, store, dropper)

/** Adds a carrier to the hidden record, saying so if it could not be written; null for a viewer who has none. */
export const lubecHiddenAdder = (hidden: LubecGearHidden | null, toast: (text: string) => void) =>
  hidden && ((carrier: LubecCarrier) => {
    lubecAddHiddenCarrier(hidden, carrier).catch(() => toast(`Could not add ${carrier.name}. Nothing changed.`))
  })
