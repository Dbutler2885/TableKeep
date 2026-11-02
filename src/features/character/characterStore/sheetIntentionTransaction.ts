import { doc, runTransaction, serverTimestamp, type DocumentReference, type Firestore, type Transaction } from 'firebase/firestore'
import { planSheetIntention, type SheetWritePlan } from './sheetIntention'
import { sheetPayload } from './sheetIntentionEdits'
import { validateSheetIntention } from './sheetIntentionValidation'
import { SheetRepair, type SheetIntention, type SheetWriteReceipt } from './sheetIntentionTypes'

export type PreparedSheetIntention = SheetWritePlan & {
  sheetRef: DocumentReference
  receiptRef: DocumentReference
}

/** Read and plan only. Prepare every affected sheet before writing any of them. */
export async function prepareSheetIntention(tx: Transaction, sheetRef: DocumentReference, intention: SheetIntention): Promise<PreparedSheetIntention> {
  validateSheetIntention(intention)
  intention = JSON.parse(sheetPayload(intention)) as SheetIntention
  sheetRef = sheetRef.withConverter(null)
  const receiptRef = doc(sheetRef, 'writeReceipts', intention.operationId)
  const receipt = await tx.get(receiptRef)
  if (receipt.exists()) return { ...planSheetIntention(undefined, intention, receipt.data() as SheetWriteReceipt), sheetRef, receiptRef }
  const sheet = await tx.get(sheetRef)
  return { ...planSheetIntention(sheet.data(), intention), sheetRef, receiptRef }
}

/** Call only after all transaction reads and validation, including external command/item reads. */
export function writePreparedSheetIntention(tx: Transaction, prepared: PreparedSheetIntention) {
  if (!prepared.mutation) return prepared.outcome
  tx.set(prepared.sheetRef, { ...prepared.mutation.sheet, updatedAt: serverTimestamp() })
  tx.set(prepared.receiptRef, prepared.mutation.receipt)
  return prepared.outcome
}

/** One envelope per sheet; refuse the whole multi-sheet operation before adding any write. */
export function writePreparedSheetIntentions(tx: Transaction, prepared: readonly PreparedSheetIntention[]) {
  const paths = prepared.map((entry) => entry.sheetRef.path)
  if (new Set(paths).size !== paths.length) throw new SheetRepair('invalid-intention')
  prepared.forEach(assertPrepared)
  return prepared.map((entry) => writePreparedSheetIntention(tx, entry))
}

function assertPrepared(prepared: PreparedSheetIntention) {
  if (prepared.outcome.status === 'repair') throw new SheetRepair(prepared.outcome.code, prepared.outcome.path)
}

/** Opt-in save path beside the legacy delayed store save. Rules authorization is introduced in ticket 07. */
export async function saveSheetIntention(db: Firestore, sheetRef: DocumentReference, intention: SheetIntention) {
  try {
    validateSheetIntention(intention)
    const snapshot = JSON.parse(sheetPayload(intention)) as SheetIntention
    return await runTransaction(db, async (tx) => writePreparedSheetIntention(tx, await prepareSheetIntention(tx, sheetRef, snapshot)))
  } catch (error) {
    if (!(error instanceof SheetRepair)) throw error
    return { status: 'repair', code: error.code, path: error.path } as const
  }
}
