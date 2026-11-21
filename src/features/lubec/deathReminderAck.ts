import { doc, runTransaction, type Firestore } from 'firebase/firestore'
import { campaignDocRef, type CampaignScope } from '../campaign/firestorePaths'
import { planSheetIntention, readSheetRevision } from '../character/characterStore/sheetIntention'
import { withSheetRevisionRetry } from '../character/characterStore/sheetIntentionRetry'
import { writePreparedSheetIntention } from '../character/characterStore/sheetIntentionTransaction'
import type { SheetWriteOutcome, SheetWriteReceipt } from '../character/characterStore/sheetIntentionTypes'
import { lubecDeathAcknowledgementEdits } from '../ruleSets/lubec/deathReminders'

/** The sheet a reminder is on: a character, or an NPC's sheet. */
export type LubecReminderSheet = { kind: 'character' | 'npc'; sheetId: string }

async function acknowledgementId(path: string, id: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([path, id, 'death-handled'])))
  return `death_${Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('')}`
}

/**
 * The GM marks a Death Save reminder handled: one revisioned write under a stable receipt, so a second press or a
 * second device finds the receipt. It rolls nothing and applies nothing.
 */
export async function acknowledgeLubecDeathReminder(db: Firestore, scope: CampaignScope, sheet: LubecReminderSheet, id: string): Promise<SheetWriteOutcome> {
  const sheetRef = campaignDocRef(db, scope, sheet.kind === 'npc' ? 'npcSheets' : 'characters', sheet.sheetId)
  const operationId = await acknowledgementId(sheetRef.path, id)
  const receiptRef = doc(sheetRef, 'writeReceipts', operationId)
  let nextRevision: number | undefined
  return withSheetRevisionRetry(sheetRef, () => runTransaction(db, async (tx) => {
    nextRevision = undefined
    const receipt = await tx.get(receiptRef)
    if (receipt.exists()) return (receipt.data() as SheetWriteReceipt).outcome
    const raw = (await tx.get(sheetRef)).data()
    if (!raw) throw new Error('The sheet is missing.')
    const intention = { operationId, baseRevision: readSheetRevision(raw), edits: lubecDeathAcknowledgementEdits(raw.lubec, id) }
    const prepared = { ...planSheetIntention(raw, intention), sheetRef, receiptRef }
    nextRevision = prepared.mutation?.receipt.outcome.revision
    return writePreparedSheetIntention(tx, prepared)
  }), () => nextRevision)
}
