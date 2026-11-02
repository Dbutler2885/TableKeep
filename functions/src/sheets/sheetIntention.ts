import { applySheetEdit, sheetPayload } from './sheetIntentionEdits.js'
import { validateSheetIntention } from './sheetIntentionValidation.js'
import { SheetRepair, type SheetIntention, type SheetWriteOutcome, type SheetWriteReceipt } from './sheetIntentionTypes.js'

export type SheetWritePlan = {
  outcome: SheetWriteOutcome
  mutation?: { sheet: Record<string, unknown>; receipt: SheetWriteReceipt }
}

/** A missing legacy revision is zero; corrupt revisions require repair. */
export function readSheetRevision(sheet: Record<string, unknown>): number {
  const revision = sheet.sheetRevision === undefined ? 0 : sheet.sheetRevision
  if (!Number.isSafeInteger(revision) || (revision as number) < 0 || (revision as number) === Number.MAX_SAFE_INTEGER) throw new SheetRepair('invalid-revision')
  return revision as number
}

function committedPlan(sheet: Record<string, unknown>, intention: SheetIntention): SheetWritePlan {
  const revision = readSheetRevision(sheet)
  if (intention.baseRevision > revision) throw new SheetRepair('future-revision')
  const edited = intention.edits.reduce(applySheetEdit, sheet)
  const outcome = { status: 'committed', operationId: intention.operationId, revision: revision + 1 } as const
  return { outcome, mutation: { sheet: { ...edited, sheetRevision: outcome.revision }, receipt: { intention, outcome } } }
}

function planCurrentSheet(sheet: Record<string, unknown> | undefined, intention: SheetIntention, receipt?: SheetWriteReceipt): SheetWritePlan {
  if (receipt) {
    if (sheetPayload(receipt.intention) !== sheetPayload(intention)) throw new SheetRepair('operation-id-reused')
    return { outcome: receipt.outcome }
  }
  if (!sheet) throw new SheetRepair('sheet-deleted')
  return committedPlan(sheet, intention)
}

/** Pure canonical-data planning. No parser or serializer can discard future fields or schema stamps here. */
export function planSheetIntention(sheet: Record<string, unknown> | undefined, intention: SheetIntention, receipt?: SheetWriteReceipt): SheetWritePlan {
  try {
    validateSheetIntention(intention)
    return planCurrentSheet(sheet, intention, receipt)
  } catch (error) {
    if (!(error instanceof SheetRepair)) throw error
    return { outcome: { status: 'repair', code: error.code, path: error.path } }
  }
}
