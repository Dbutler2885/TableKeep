// Deleting a revisioned sheet together with its write receipts.
//
// A transaction reads by reference, so the receipts are listed before it, after
// the sheet's revision is read. Every receipt is committed with a revision
// increment, so a sheet whose revision is unchanged inside the transaction has
// no receipt the listing missed; a changed revision lists again. The sheet goes
// in the same commit as its receipts: the owner's right to delete a receipt is
// read off the sheet, and a delayed save that arrives once the sheet is gone
// finds nothing to edit, so it cannot bring the sheet back or leave a receipt.

import {
  collection,
  getDocFromServer,
  getDocs,
  runTransaction,
  writeBatch,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase/firestore'
import { readSheetRevision } from './sheetIntention'

/** At most this many receipts go in the commit that deletes the sheet; older ones go first. */
export const SHEET_TEARDOWN_FINAL_RECEIPTS = 200

/** Receipts per batch when a sheet has more than the final commit holds. */
const RECEIPT_BATCH_SIZE = 400

/** Listings tried before a sheet that keeps changing is reported. */
const SHEET_TEARDOWN_ATTEMPTS = 3

/** Thrown when a sheet was edited during every attempt to delete it. */
export const SHEET_TEARDOWN_CONTENDED = 'The sheet kept changing while it was being deleted.'

/** More work in the deleting transaction, given the sheet as read there; it reads before it writes. */
export type SheetTeardownWork = (tx: Transaction, sheet: DocumentSnapshot) => Promise<void> | void

type ReceiptListing = { revision: number; receipts: DocumentReference[] }

async function listReceipts(sheetRef: DocumentReference): Promise<ReceiptListing | null> {
  const sheet = await getDocFromServer(sheetRef)
  if (!sheet.exists()) return null
  const listed = await getDocs(collection(sheetRef, 'writeReceipts'))
  return { revision: readSheetRevision(sheet.data()), receipts: listed.docs.map((receipt) => receipt.ref) }
}

async function deleteInBatches(db: Firestore, refs: DocumentReference[]) {
  for (let start = 0; start < refs.length; start += RECEIPT_BATCH_SIZE) {
    const batch = writeBatch(db)
    refs.slice(start, start + RECEIPT_BATCH_SIZE).forEach((ref) => batch.delete(ref))
    await batch.commit()
  }
}

// True when the sheet is gone, by this commit or another; false when it changed since the listing.
function deleteListed(db: Firestore, sheetRef: DocumentReference, listing: ReceiptListing, work?: SheetTeardownWork) {
  return runTransaction(db, async (tx) => {
    const sheet = await tx.get(sheetRef)
    if (!sheet.exists()) return true
    if (readSheetRevision(sheet.data()) !== listing.revision) return false
    await work?.(tx, sheet)
    listing.receipts.forEach((receipt) => tx.delete(receipt))
    tx.delete(sheetRef)
    return true
  })
}

async function attemptTeardown(db: Firestore, sheetRef: DocumentReference, work?: SheetTeardownWork) {
  const listing = await listReceipts(sheetRef)
  if (!listing) return true
  const overflow = listing.receipts.length - SHEET_TEARDOWN_FINAL_RECEIPTS
  if (overflow > 0) await deleteInBatches(db, listing.receipts.splice(0, overflow))
  return deleteListed(db, sheetRef, listing, work)
}

/**
 * Deletes the sheet and every write receipt under it, running `work` in the
 * same transaction. A sheet already gone is left alone. Rejects when Firestore
 * refuses, which leaves the sheet and its final receipts in place, or when the
 * sheet changed during every attempt.
 */
export async function deleteSheetWithReceipts(db: Firestore, sheetRef: DocumentReference, work?: SheetTeardownWork): Promise<void> {
  const ref = sheetRef.withConverter(null)
  for (let attempt = 0; attempt < SHEET_TEARDOWN_ATTEMPTS; attempt += 1) {
    if (await attemptTeardown(db, ref, work)) return
  }
  throw new Error(SHEET_TEARDOWN_CONTENDED)
}
