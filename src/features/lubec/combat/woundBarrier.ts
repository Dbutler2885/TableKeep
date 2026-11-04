import type { DocumentSnapshot, Firestore, Transaction } from 'firebase/firestore'
import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import { parseLubecCharacter } from '../../ruleSets/lubec/characterParser'
import type { LubecCharacterSheet } from '../../ruleSets/lubec/characterRecord'
import type { LubecEffect } from '../../ruleSets/lubec/effects'
import { lubecSheetModifiers } from '../../ruleSets/lubec/modifiers'
import { combatantKey } from './engine/inputs'
import type { CombatantSelection, CombatState } from './engine/types'
import { readWoundFight, readWoundSheet, requireWoundFightLive } from './woundRecords'
import { WOUND_WAIT, type CombatWoundOrigin, type CombatWoundScope } from './woundTypes'

export type CombatInputRound = { fightId: string; round: number }

/** Pass a confirmed server snapshot, never an optimistic store revision. */
export function confirmedCombatRevision(snapshot: DocumentSnapshot): number | null {
  if (!snapshot.exists() || snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return null
  return readSheetRevision(snapshot.data())
}

function deferredEffect(effect: LubecEffect, context: CombatInputRound): boolean {
  const origin = effect.combatOrigin as CombatWoundOrigin | undefined
  return origin?.fightId === context.fightId && context.round < origin.effectiveRound
}

/** Labels and counters remain immediate; only this fight's premature numeric modifiers are filtered. */
export function combatInputModifiers(sheet: LubecCharacterSheet, context: CombatInputRound | null) {
  if (!context) return lubecSheetModifiers(sheet)
  const effects = sheet.effects.map((effect) => deferredEffect(effect, context)
    ? { ...effect, steps: effect.steps.map((step) => ({ ...step, modifiers: [] })) } : effect)
  return lubecSheetModifiers({ ...sheet, effects })
}

function dueTo(target: CombatantSelection, round: number) {
  return (entry: { target: CombatantSelection; effectiveRound: number }) => combatantKey(entry.target) === combatantKey(target) && entry.effectiveRound <= round
}

function requireRevisions(confirmed: number | null, canonical: number, newest: number) {
  if (confirmed === null || confirmed < newest || canonical < newest) throw new Error(WOUND_WAIT)
}

/** Shared by Declare, GM Return and before-initiative input freezing. Movement does not call it. */
export function requireCombatWoundBarrier(state: CombatState, target: CombatantSelection, round: number, confirmedRevision: number | null, canonicalRevision: number) {
  const pending = state.woundOutbox.some(dueTo(target, round))
  if (pending) throw new Error(WOUND_WAIT)
  const acknowledged = state.woundAcknowledgements.filter((ack) => combatantKey(ack.target) === combatantKey(target))
  const newest = Math.max(0, ...acknowledged.map((ack) => ack.targetRevision))
  requireRevisions(confirmedRevision, canonicalRevision, newest)
}

/** Invoke inside the caller's action transaction, before freezing numbers or writing anything. */
export async function readCombatInputs(db: Firestore, tx: Transaction, scope: CombatWoundScope, target: CombatantSelection, confirmedRevision: number | null) {
  const { fight, activeFightId } = await readWoundFight(db, tx, scope)
  requireWoundFightLive(scope, fight, activeFightId)
  if (!fight.state.combatants.some((actor) => actor.key === combatantKey(target))) throw new Error('That combatant is not in this fight.')
  const { raw } = await readWoundSheet(db, tx, scope, target)
  const revision = readSheetRevision(raw)
  const round = Math.max(1, fight.state.round)
  requireCombatWoundBarrier(fight.state, target, round, confirmedRevision, revision)
  const sheet = parseLubecCharacter(target.sheetId, raw).lubec
  return { sheet, revision, modifiers: combatInputModifiers(sheet, { fightId: scope.fightId, round }) }
}
