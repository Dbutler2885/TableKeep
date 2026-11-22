import { doc, type DocumentReference, type Transaction } from 'firebase/firestore'
import { sheetPayload } from '../../character/characterStore/sheetIntentionEdits'
import { planSheetIntention, readSheetRevision } from '../../character/characterStore/sheetIntention'
import { writePreparedSheetIntentions, type PreparedSheetIntention } from '../../character/characterStore/sheetIntentionTransaction'
import { withSheetRevisionRetry } from '../../character/characterStore/sheetIntentionRetry'
import { sheetRecordEdits } from '../../../../functions/src/sheets/sheetIntentionDiff'
import { SheetRepair } from '../../character/characterStore/sheetIntentionTypes'
import type { LubecMoveRequest } from './lubecMoveTransaction'
import type { LubecMoveRecord } from '../../ruleSets/lubec/gear/containers'

export const moveCommand = ({ scope, from, to, move }: LubecMoveRequest) => JSON.parse(JSON.stringify({ scope, from, to, move })) as object
export const isSheetRef = (ref: DocumentReference) => ['characters', 'npcSheets'].includes(ref.parent.id)

export async function hasMoveReceipt(tx: Transaction, refs: readonly DocumentReference[], request: LubecMoveRequest) {
  const receipts = await Promise.all(refs.filter(isSheetRef).map((ref) => tx.get(doc(ref, 'writeReceipts', request.operationId!))))
  const found = receipts.filter((receipt) => receipt.exists())
  if (found.length === 0) return false
  if (found.length !== receipts.length) throw new SheetRepair('invalid-intention')
  found.forEach((receipt) => assertMoveCommand(receipt.data().command, request))
  return true
}

function assertMoveCommand(command: unknown, request: LubecMoveRequest) {
  if (sheetPayload(command) !== sheetPayload(moveCommand(request))) throw new SheetRepair('operation-id-reused')
}

export function prepareMovedSheet(ref: DocumentReference, raw: Record<string, unknown>, after: LubecMoveRecord, request: LubecMoveRequest): PreparedSheetIntention | null {
  if (!('gear' in after)) return null
  const beforeGear = (raw.lubec as { gear: unknown }).gear
  const edits = sheetRecordEdits({ lubec: { gear: beforeGear } }, { lubec: { gear: JSON.parse(sheetPayload(after.gear)) as unknown } })
  const intention = { operationId: request.operationId!, baseRevision: readSheetRevision(raw), edits }
  const prepared = { ...planSheetIntention(raw, intention), sheetRef: ref, receiptRef: doc(ref, 'writeReceipts', request.operationId!) }
  if (prepared.mutation) Object.assign(prepared.mutation.receipt, { command: moveCommand(request) })
  return prepared
}

export function writeMovedSheets(tx: Transaction, prepared: (PreparedSheetIntention | null)[]) {
  writePreparedSheetIntentions(tx, prepared.filter((entry): entry is PreparedSheetIntention => entry !== null))
}

/** At most two sheets, each with its own bounded stale-revision recovery. */
export function withMoveSheetRetries<T>(refs: readonly DocumentReference[], write: () => Promise<T>, revisions: Map<string, number>) {
  const guarded = refs.filter(isSheetRef).reduce((inner, ref) => () => withSheetRevisionRetry(ref, inner, () => revisions.get(ref.path)), write)
  return guarded()
}
