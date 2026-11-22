import { doc, onSnapshot, runTransaction, type DocumentReference } from 'firebase/firestore'
import { campaignDocRef } from '../campaign/firestorePaths'
import { assertCharacterAtCurrentVersion } from '../ruleSets/characterSchemaStamp'
import { lubecCharacterVersioning } from '../ruleSets/characterMigrations'
import type { StoredCharacter } from '../ruleSets/storedCharacter'
import { lubecWakingIntention } from '../ruleSets/lubec/waking'
import { lubecReachSaveIntention } from '../ruleSets/lubec/reachSave'
import { planSheetIntention, readSheetRevision } from '../character/characterStore/sheetIntention'
import { withSheetRevisionRetry } from '../character/characterStore/sheetIntentionRetry'
import { writePreparedSheetIntention } from '../character/characterStore/sheetIntentionTransaction'
import type { SheetWriteOutcome, SheetWriteReceipt } from '../character/characterStore/sheetIntentionTypes'
import { lubecMoveStoreOf, type LubecGearDropStore, type LubecGearRecords } from './gear/lubecGearDrop'
import { quietSheets } from './gear/lubecMoveTransaction'

/** Which Save a card's recovery rolls: waking from unconsciousness, or the Save a reached step asks for. */
export type LubecRecoveryKind = 'wake' | 'reach'

export type LubecEffectRecovery = ((id: string, kind?: LubecRecoveryKind) => Promise<SheetWriteOutcome>) | null

const INTENTIONS = { wake: lubecWakingIntention, reach: lubecReachSaveIntention } as const

/** One stable operation per card and kind of Save, shared by every device resolving it. */
async function recoveryIdentity(path: string, id: string, kind: LubecRecoveryKind) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([path, id, kind])))
  const hex = Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('')
  return { operationId: `recovery_${hex}`, hex }
}

function snapshotAtRevision(ref: DocumentReference, revision: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = onSnapshot(ref, (snap) => {
      if (!snap.exists()) { stop(); reject(new Error('The sheet is missing.')); return }
      if (snap.metadata.hasPendingWrites || readSheetRevision(snap.data()) < revision) return
      stop()
      resolve()
    }, reject)
  })
}

/** Resolves a card's waking or reached-step Save against the canonical sheet in one revisioned transaction; replay returns the original receipt. */
export function lubecEffectRecovery(records: LubecGearRecords, store: LubecGearDropStore, sheetId: string): Exclude<LubecEffectRecovery, null> {
  return async (id, kind = 'wake') => {
    await quietSheets(lubecMoveStoreOf(store), [sheetId])
    const collection = records.sheet.kind === 'npc' ? 'npcSheets' : 'characters'
    const sheetRef = campaignDocRef(records.db, records.scope, collection, sheetId)
    const { operationId, hex } = await recoveryIdentity(sheetRef.path, id, kind)
    const receiptRef = doc(sheetRef, 'writeReceipts', operationId)
    let nextRevision: number | undefined
    const outcome = await withSheetRevisionRetry(sheetRef, () => runTransaction(records.db, async (tx) => {
      nextRevision = undefined
      const receipt = await tx.get(receiptRef)
      if (receipt.exists()) return (receipt.data() as SheetWriteReceipt).outcome
      const snap = await tx.get(sheetRef)
      const raw = snap.data()
      if (!raw) throw new Error('The sheet is missing.')
      assertCharacterAtCurrentVersion(raw as StoredCharacter, lubecCharacterVersioning)
      let ordinal = 0
      const dice = () => {
        const offset = 8 * ordinal++
        return parseInt(hex.slice(offset, offset + 8), 16) / 2 ** 32
      }
      const intention = INTENTIONS[kind](raw, id, operationId, dice)
      const prepared = { ...planSheetIntention(raw, intention), sheetRef, receiptRef }
      nextRevision = prepared.mutation?.receipt.outcome.revision
      return writePreparedSheetIntention(tx, prepared)
    }), () => nextRevision)
    if (outcome.status === 'committed') await snapshotAtRevision(sheetRef, outcome.revision)
    return outcome
  }
}
