// The writes a shared carrier takes (spec 4.3 and 4.7) other than a move
// between two records, which is `lubecMoveBetween`. Each runs against the
// carrier as stored. A change of the things in it is a one-record transaction:
// the plan was made from the page's copy, so it stands only while that copy is
// what the transaction reads.

import { runTransaction, serverTimestamp, setDoc, type DocumentReference, type Firestore, type Transaction } from 'firebase/firestore'
import { campaignGmItemRef, campaignSharedCarrierRef, type CampaignScope } from '../../campaign/firestorePaths'
import type { LubecCarrierDraft } from '../../ruleSets/lubec/gear/carriers'
import { lubecCarrierGear, LUBEC_STALE_MOVE, type LubecDropper } from '../../ruleSets/lubec/gear/containers'
import { lubecDroppedOnDelete } from '../../ruleSets/lubec/gear/deleteDrop'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecChangeCarrier, parseLubecSharedCarrier, type LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import { snapshotAfter, stored, type LubecMoveResult } from './lubecMoveTransaction'

/** Where the campaign's shared carriers are. */
export type LubecSharedRecords = { db: Firestore; scope: CampaignScope }

const carrierRef = ({ db, scope }: LubecSharedRecords, id: string) => campaignSharedCarrierRef(db, scope, id)

const staleMove = { ok: false as const, msg: LUBEC_STALE_MOVE }

type Read = { carrier: LubecSharedCarrier; updatedAt: unknown }

async function readCarrier(tx: Transaction, ref: DocumentReference): Promise<Read | null> {
  const snap = await tx.get(ref)
  return snap.exists() ? { carrier: parseLubecSharedCarrier(snap.data(), snap.id), updatedAt: snap.data().updatedAt } : null
}

/** Stores a new shared carrier. */
export function lubecAddSharedCarrier(records: LubecSharedRecords, carrier: LubecSharedCarrier): Promise<void> {
  return setDoc(carrierRef(records, carrier.id), { ...stored(carrier), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
}

const sameItems = (a: readonly LubecItem[], b: readonly LubecItem[]) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Replaces the things in `seen` with `items`, refused with the stale-move text
 * when they are no longer what the page showed. It waits for the snapshot that
 * carries the write, so the page's copy has it before it takes another edit.
 */
export async function lubecEditSharedItems(records: LubecSharedRecords, seen: LubecSharedCarrier, items: readonly LubecItem[]): Promise<LubecMoveResult> {
  const ref = carrierRef(records, seen.id)
  const before = await runTransaction(records.db, async (tx) => {
    const read = await readCarrier(tx, ref)
    if (!read || !sameItems(read.carrier.items, seen.items)) return null
    tx.set(ref, { items: stored(items), updatedAt: serverTimestamp() }, { merge: true })
    return { at: read.updatedAt }
  })
  if (!before) return staleMove
  await snapshotAfter(ref, before.at)
  return { ok: true }
}

/** A new name and pockets, checked against what is in the carrier now. */
export function lubecChangeSharedCarrier(records: LubecSharedRecords, carrierId: string, draft: LubecCarrierDraft): Promise<LubecMoveResult> {
  const ref = carrierRef(records, carrierId)
  return runTransaction(records.db, async (tx) => {
    const read = await readCarrier(tx, ref)
    if (!read) return staleMove
    const change = lubecChangeCarrier(read.carrier, draft)
    if (!change.ok) return change
    tx.set(ref, { name: change.name, pockets: stored(change.pockets), updatedAt: serverTimestamp() }, { merge: true })
    return { ok: true }
  })
}

/** Deletes the carrier, and everything in it becomes a dropped item in the GM's Items tab, in one transaction. */
export function lubecDeleteSharedCarrier(records: LubecSharedRecords, carrierId: string, by: LubecDropper): Promise<void> {
  const ref = carrierRef(records, carrierId)
  return runTransaction(records.db, async (tx) => {
    const read = await readCarrier(tx, ref)
    if (!read) return
    lubecDroppedOnDelete(lubecCarrierGear(read.carrier), by).forEach((item) => {
      tx.set(campaignGmItemRef(records.db, records.scope, item.id), { ...stored(item), createdAt: serverTimestamp() })
    })
    tx.delete(ref)
  })
}
