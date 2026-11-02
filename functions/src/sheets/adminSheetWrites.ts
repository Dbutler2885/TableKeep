import { FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore'
import { planSheetIntention, readSheetRevision } from './sheetIntention.js'
import { sheetRecordEdits } from './sheetIntentionDiff.js'
import { sheetObject } from './sheetIntentionPath.js'
import { SheetRepair, type SheetWriteReceipt } from './sheetIntentionTypes.js'

type Fields = Record<string, unknown>
export type AdminSheetChange = { ref: DocumentReference; current: Fields; patch: Fields }

function mergePatch(current: Fields, patch: Fields): Fields {
  return { ...current, ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, mergeValue(current[key], value)])) }
}

function mergeValue(current: unknown, patch: unknown): unknown {
  return sheetObject(current) && sheetObject(patch) ? mergePatch(current, patch) : patch
}

/** Uses the same planner, stable row intentions, revisions and receipts as browser writes. */
export async function writeAdminSheetChanges(tx: Transaction, changes: AdminSheetChange[], operationId: string, metadata: Fields) {
  if (new Set(changes.map((change) => change.ref.path)).size !== changes.length) throw new SheetRepair('invalid-intention')
  const receipts = await Promise.all(changes.map((change) => tx.get(change.ref.collection('writeReceipts').doc(operationId))))
  const plans = changes.map((change, index) => planAdminSheet(change, operationId, receipts[index].data() as SheetWriteReceipt | undefined))
  plans.forEach((plan) => { if (plan.outcome.status === 'repair') throw new SheetRepair(plan.outcome.code, plan.outcome.path) })
  plans.forEach((plan, index) => {
    if (!plan.mutation) return
    tx.set(changes[index].ref, { ...plan.mutation.sheet, updatedAt: FieldValue.serverTimestamp() })
    tx.set(changes[index].ref.collection('writeReceipts').doc(operationId), { ...plan.mutation.receipt, ...metadata })
  })
}

function planAdminSheet(change: AdminSheetChange, operationId: string, receipt?: SheetWriteReceipt) {
  const intention = { operationId, baseRevision: readSheetRevision(change.current), edits: sheetRecordEdits(change.current, mergePatch(change.current, change.patch)) }
  return planSheetIntention(change.current, intention, receipt)
}
