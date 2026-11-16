import { doc, type Firestore, type Transaction } from 'firebase/firestore'
import { sheetRecordEdits } from '../../../../functions/src/sheets/sheetIntentionDiff'
import { planSheetIntention, readSheetRevision } from '../../character/characterStore/sheetIntention'
import type { SheetEdit, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import { sheetPayload } from '../../character/characterStore/sheetIntentionEdits'
import { writePreparedSheetIntentions, type PreparedSheetIntention } from '../../character/characterStore/sheetIntentionTransaction'
import { combatRef } from './combatReads'
import { combatSheetCollection } from './combatSheetRecord'
import { combatantKey } from './engine/inputs'
import type { LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import type { CombatantSelection, CombatCommand, CombatPlan } from './engine/types'

export type CombatRawSheets = ReadonlyMap<string, Record<string, unknown>>

/** One sheet receipt per command: a retried command finds the receipt instead of spending twice. */
export async function combatSheetOperationId(command: CombatCommand): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([command.envelope.fightId, command.envelope.id]))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return `combat_${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

const gearOf = (raw: Record<string, unknown>) => (raw.lubec as { gear?: unknown } | undefined)?.gear

/** Plans each gear, card and counter change against the sheet this transaction read; call after every read and before any write. */
export async function prepareCombatSheets(db: Firestore, command: CombatCommand, plan: CombatPlan, raws: CombatRawSheets): Promise<PreparedSheetIntention[]> {
  const operationId = await combatSheetOperationId(command)
  const changes = new Map<string, { selection: CombatantSelection; gear?: LubecGear; removeEffects?: string[]; stressDelta?: number }>()
  for (const change of plan.sheets ?? []) changes.set(combatantKey(change.selection), change)
  for (const change of plan.sheetEffects ?? []) {
    const key = combatantKey(change.selection)
    changes.set(key, { ...changes.get(key), ...change })
  }
  return [...changes.values()].map(({ selection, gear, removeEffects = [], stressDelta = 0 }) => {
    const raw = raws.get(combatantKey(selection))
    if (!raw) throw new Error('That sheet was not read; nothing was spent.')
    const edits: SheetEdit[] = gear ? sheetRecordEdits({ lubec: { gear: gearOf(raw) } }, { lubec: { gear: JSON.parse(sheetPayload(gear)) as unknown } }) : []
    const effects = (raw.lubec as { effects?: { id: string }[] } | undefined)?.effects ?? []
    for (const id of removeEffects) {
      const effect = effects.find((entry) => entry.id === id)
      if (!effect) throw new Error('That effect changed; refresh before standing.')
      edits.push({ kind: 'remove', path: ['lubec', 'effects', { recordId: id }], base: { exists: true, value: effect as unknown as SheetValue } })
    }
    if (stressDelta) edits.push({ kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 0, amount: stressDelta })
    const sheetRef = combatRef(db, command, combatSheetCollection(selection), selection.sheetId)
    const intention = { operationId, baseRevision: readSheetRevision(raw), edits }
    return { ...planSheetIntention(raw, intention), sheetRef, receiptRef: doc(sheetRef, 'writeReceipts', operationId) }
  })
}

/** Throws before adding any write when a planned sheet needs repair, so nothing is spent. */
export const writeCombatSheets = (tx: Transaction, prepared: readonly PreparedSheetIntention[]) => writePreparedSheetIntentions(tx, prepared)
