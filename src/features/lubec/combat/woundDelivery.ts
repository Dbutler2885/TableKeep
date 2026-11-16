import { runTransaction, serverTimestamp, type DocumentReference, type Firestore, type Transaction } from 'firebase/firestore'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { prepareSheetIntention, writePreparedSheetIntention } from '../../character/characterStore/sheetIntentionTransaction'
import { withSheetRevisionRetry } from '../../character/characterStore/sheetIntentionRetry'
import { combatantKey } from './engine/inputs'
import type { CombatFight } from './engine/types'
import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import type { SheetIntention } from '../../character/characterStore/sheetIntentionTypes'
import { closingIntention, roundTickIntention } from './roundTick'
import { combatWoundIntention, combatWoundOperationId } from './woundIntention'
import { readWoundFight, readWoundSheet, requireWoundFightLive, requireWoundGm } from './woundRecords'
import { requireFreshWoundRead, retryStaleWoundRead } from './woundStaleRead'
import type { CombatWound, CombatWoundAcknowledgement, CombatWoundScope } from './woundTypes'

type WoundAttempt = { ref: DocumentReference; revision: number }
type RecordAttempt = (attempt: WoundAttempt) => void

function requireTarget(fight: CombatFight, wound: CombatWound) {
  if (!fight.state.combatants.some((actor) => actor.key === combatantKey(wound.target))) throw new Error('Wound target is not in this fight.')
  if (wound.originatingRound > fight.state.round) throw new Error('Wound originates in a future round.')
  if (fight.state.woundOutbox.filter((entry) => entry.id === wound.id).length !== 1) throw new Error('Duplicate wound identity; repair the outbox.')
}

/** The sheet change an outbox entry makes: a wound's cards and counters, or a round tick's endings, or nothing for a tick with nothing to end. */
function intentionOf(raw: Record<string, unknown>, wound: CombatWound, fightId: string, operationId: string): SheetIntention | null {
  if (wound.kind === 'tick') return roundTickIntention(raw, wound, fightId, operationId)
  if (wound.kind === 'close') return closingIntention(raw, wound, fightId, operationId)
  return combatWoundIntention(raw, wound, fightId, operationId)
}

async function applyWound(db: Firestore, tx: Transaction, scope: CombatWoundScope, fight: CombatFight, wound: CombatWound, recordAttempt: RecordAttempt) {
  requireTarget(fight, wound)
  const { ref, raw } = await readWoundSheet(db, tx, scope, wound.target)
  const operationId = await combatWoundOperationId(scope.fightId, wound.id)
  const intention = intentionOf(raw, wound, scope.fightId, operationId)
  const prepared = intention ? await prepareSheetIntention(tx, ref, intention) : null
  if (prepared) {
    requireFreshWoundRead(prepared)
    if (prepared.outcome.status === 'repair') throw new Error(`Wound delivery needs sheet repair: ${prepared.outcome.code}`)
  }
  // A tick that ends nothing writes no sheet: the revision it read is the one the next roll must read.
  const revision = prepared ? (prepared.outcome as { revision: number }).revision : readSheetRevision(raw)
  recordAttempt({ ref, revision })
  const acknowledgement: CombatWoundAcknowledgement = {
    id: wound.id, target: wound.target, targetRevision: revision,
    originatingRound: wound.originatingRound, effectiveRound: wound.effectiveRound, operationId,
  }
  const state = {
    ...fight.state,
    woundOutbox: fight.state.woundOutbox.filter((entry) => entry.id !== wound.id),
    woundAcknowledgements: [...fight.state.woundAcknowledgements, acknowledgement],
  }
  if (prepared) writePreparedSheetIntention(tx, prepared)
  tx.update(campaignDocRef(db, scope, 'combats', scope.fightId), { state, updatedAt: serverTimestamp() })
  return acknowledgement
}

async function deliver(db: Firestore, tx: Transaction, scope: CombatWoundScope, userId: string, woundId: string | undefined, recordAttempt: RecordAttempt) {
  await requireWoundGm(db, tx, scope, userId)
  const { fight, activeFightId } = await readWoundFight(db, tx, scope)
  const acknowledged = fight.state.woundAcknowledgements.find((entry) => entry.id === woundId)
  if (acknowledged) return acknowledged
  const wound = woundId === undefined ? fight.state.woundOutbox[0] : fight.state.woundOutbox.find((entry) => entry.id === woundId)
  if (!wound) return null
  requireWoundFightLive(scope, fight, activeFightId)
  return applyWound(db, tx, scope, fight, wound, recordAttempt)
}

/** The sheet, receipt, queue removal and retained revision acknowledgement commit together. */
export function deliverCombatWound(db: Firestore, scope: CombatWoundScope, userId: string, woundId?: string) {
  let attempt: WoundAttempt | undefined
  const write = () => retryStaleWoundRead(() => runTransaction(db, (tx) => {
    attempt = undefined
    return deliver(db, tx, scope, userId, woundId, (value) => { attempt = value })
  }))
  return withSheetRevisionRetry(() => attempt?.ref, write, () => attempt?.revision)
}

/** Rereads the latest fight on each pass, including wounds enqueued during a drain. */
export async function drainCombatWounds(db: Firestore, scope: CombatWoundScope, userId: string): Promise<void> {
  while (await deliverCombatWound(db, scope, userId)) { /* Each commit removes one identified wound. */ }
}
