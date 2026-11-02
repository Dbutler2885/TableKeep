import { planSheetIntention, readSheetRevision } from './sheetIntention'
import type { SheetIntention, SheetWriteOutcome } from './sheetIntentionTypes'

export type PendingSheetEdit = { intention: SheetIntention; committedRevision?: number; error?: string }
export type OptimisticSheet = { confirmed: Record<string, unknown>; pending: PendingSheetEdit[] }

export function acknowledgeSheetEdit(entry: PendingSheetEdit, outcome: SheetWriteOutcome) {
  if (outcome.status === 'committed') entry.committedRevision = outcome.revision
  else entry.error = repairMessage(outcome.code)
}

export function acceptConfirmedSheet(state: OptimisticSheet, incoming: Record<string, unknown>) {
  if (readSheetRevision(incoming) < readSheetRevision(state.confirmed)) return
  state.confirmed = incoming
  state.pending = state.pending.filter((entry) => !isConfirmedEdit(entry, incoming))
}

function isConfirmedEdit(entry: PendingSheetEdit, incoming: Record<string, unknown>) {
  return entry.committedRevision !== undefined && entry.committedRevision <= readSheetRevision(incoming)
}

/** Rebase only unapplied intentions, never hide a newer confirmed sheet behind a local replacement. */
export function optimisticSheet(state: OptimisticSheet): Record<string, unknown> {
  return state.pending.reduce(replaySheetEdit, state.confirmed)
}

function replaySheetEdit(current: Record<string, unknown>, entry: PendingSheetEdit) {
  if (isConfirmedEdit(entry, current)) return current
  const plan = planSheetIntention(current, entry.intention)
  if (!plan.mutation) {
    acknowledgeSheetEdit(entry, plan.outcome)
    return current
  }
  // Optimistic replay is not a server commit and must not manufacture revisions.
  return { ...plan.mutation.sheet, sheetRevision: readSheetRevision(current) }
}

const REPAIR_MESSAGES: Record<string, string> = {
  'value-conflict': 'Another device changed the same field. Your unsaved edit is retained for review.',
  'record-missing': 'The item or effect you edited is no longer on the sheet. Your unsaved edit is retained for review.',
  'sheet-deleted': 'This sheet has been deleted. Your unsaved edits are retained for review.',
  'record-exists': 'An item or effect with that identity is already on the sheet. Your unsaved edit is retained for review.',
  'operation-id-reused': 'This edit does not match its original save. Your unsaved edits are retained for review.',
}
function repairMessage(code: string) {
  return REPAIR_MESSAGES[code] ?? 'This sheet needs repair before the edit can be saved. Your unsaved edits are retained for review.'
}
