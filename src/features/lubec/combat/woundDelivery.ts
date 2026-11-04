import { runTransaction, serverTimestamp, type DocumentReference, type Firestore, type Transaction } from 'firebase/firestore'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { prepareSheetIntention, writePreparedSheetIntention } from '../../character/characterStore/sheetIntentionTransaction'
import { withSheetRevisionRetry } from '../../character/characterStore/sheetIntentionRetry'
import { combatantKey } from './engine/inputs'
import type { CombatFight } from './engine/types'
import { combatWoundIntention, combatWoundOperationId } from './woundIntention'
import { readWoundFight, readWoundSheet, requireWoundFightLive, requireWoundGm } from './woundRecords'
import type { CombatWound, CombatWoundAcknowledgement, CombatWoundScope } from './woundTypes'

type WoundAttempt = { ref: DocumentReference; revision: number }
type RecordAttempt = (attempt: WoundAttempt) => void

function requireTarget(fight: CombatFight, wound: CombatWound) {
  if (!fight.state.combatants.some((actor) => actor.key === combatantKey(wound.target))) throw new Error('Wound target is not in this fight.')
  if (wound.originatingRound > fight.state.round) throw new Error('Wound originates in a future round.')
  if (fight.state.woundOutbox.filter((entry) => entry.id === wound.id).length !== 1) throw new Error('Duplicate wound identity; repair the outbox.')
}

async function applyWound(db: Firestore, tx: Transaction, scope: CombatWoundScope, fight: CombatFight, wound: CombatWound, recordAttempt: RecordAttempt) {
  requireTarget(fight, wound)
  const { ref, raw } = await readWoundSheet(db, tx, scope, wound.target)
  const operationId = await combatWoundOperationId(scope.fightId, wound.id)
  const prepared = await prepareSheetIntention(tx, ref, combatWoundIntention(raw, wound, scope.fightId, operationId))
  if (prepared.outcome.status === 'repair') throw new Error(`Wound delivery needs sheet repair: ${prepared.outcome.code}`)
  recordAttempt({ ref, revision: prepared.outcome.revision })
  const acknowledgement: CombatWoundAcknowledgement = {
    id: wound.id, target: wound.target, targetRevision: prepared.outcome.revision,
    originatingRound: wound.originatingRound, effectiveRound: wound.effectiveRound, operationId,
  }
  const state = {
    ...fight.state,
    woundOutbox: fight.state.woundOutbox.filter((entry) => entry.id !== wound.id),
    woundAcknowledgements: [...fight.state.woundAcknowledgements, acknowledgement],
  }
  writePreparedSheetIntention(tx, prepared)
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
  const write = () => runTransaction(db, (tx) => {
    attempt = undefined
    return deliver(db, tx, scope, userId, woundId, (value) => { attempt = value })
  })
  return withSheetRevisionRetry(() => attempt?.ref, write, () => attempt?.revision)
}

/** Rereads the latest fight on each pass, including wounds enqueued during a drain. */
export async function drainCombatWounds(db: Firestore, scope: CombatWoundScope, userId: string): Promise<void> {
  while (await deliverCombatWound(db, scope, userId)) { /* Each commit removes one identified wound. */ }
}
