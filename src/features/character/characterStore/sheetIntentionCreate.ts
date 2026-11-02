import { withSheetRevisionRetry } from './sheetIntentionRetry'
import { doc, runTransaction, type DocumentReference, type Firestore } from 'firebase/firestore'
import { sheetPayload } from './sheetIntentionEdits'
import { SheetRepair } from './sheetIntentionTypes'

/** A stable initial creation is separate from mutations of an existing sheet. */
export function createRevisionedSheet(db: Firestore, ref: DocumentReference, fields: Record<string, unknown>, initial: Record<string, unknown>) {
  const operationId = `create-${ref.id}`
  const receiptRef = doc(ref, 'writeReceipts', operationId)
  const createPayload = sheetPayload(initial)
  let attemptedRevision: number | undefined
  const create = () => runTransaction(db, async (tx) => {
    attemptedRevision = undefined
    const existing = await tx.get(ref)
    if (existing.exists()) {
      const receipt = await tx.get(receiptRef)
      if (receipt.data()?.createPayload !== createPayload) throw new SheetRepair('value-conflict')
      return
    }
    attemptedRevision = 0
    tx.set(ref, { ...fields, sheetRevision: 0 })
    tx.set(receiptRef, { createPayload, outcome: { status: 'committed', operationId, revision: 0 } })
  })
  return withSheetRevisionRetry(ref, create, () => attemptedRevision)
}
