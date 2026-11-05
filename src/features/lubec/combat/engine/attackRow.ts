import { keptLubecRoll, lubecFailedCheckStress, type LubecAdvantage, type LubecCheckKind } from '../../../ruleSets/lubec/checkRoll'
import { lubecCurrentValue, lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import type { LubecDodgeballOutcome } from '../../../ruleSets/lubec/dodgeballTable'
import { lubecDodgeballRow, type LubecDodgeballEffect, type LubecLocatedDodgeballRow } from '../../../ruleSets/lubec/dodgeballWound'
import type { LubecArrival } from '../../../ruleSets/lubec/gear/arrival'
import { lubecPlaceDetached } from '../../../ruleSets/lubec/gear/detachedItems'
import type { LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import { place } from '../../../ruleSets/lubec/gear/placement'
import type { CombatWound } from '../woundTypes'
import { repairPlan } from './attackAim'
import { closeAttack, pad, stepRequest } from './attackFlow'
import { attackAt, attackRepair, combatantOf, combatSheetOf, defenderOf } from './attackParty'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { requireLiveContext } from './context'
import { combatInputModifiers } from './inputModifiers'
import type { CombatAttack, CombatCheckRoll, CombatCommand, Combatant, CombatFight, CombatHandler, CombatPlan, CombatSheet, CombatState, CombatWoundRow } from './types'

type Outcome = LubecDodgeballOutcome<LubecDodgeballEffect>

/** The located Dodgeball row for this hit; its Impact is positive and its part is one of the 17. */
const rowOf = (attack: CombatAttack): LubecLocatedDodgeballRow => lubecDodgeballRow(attack.landing!.part!, attack.impact!.total)!

function storedRow(row: LubecLocatedDodgeballRow): CombatWoundRow {
  const check = row.resolution.kind === 'check' ? { ...row.resolution.check } : null
  return { group: row.group, impact: row.impact, name: row.name, text: row.text, severity: row.severity, trauma: row.trauma, check }
}

/** One sheet effect for the row: its templates' modifiers and labels together, the struck part kept for a hand injury. */
function rowEffect(row: CombatWoundRow, outcome: Outcome, part: string, entropy: CombatEntropy) {
  const steps = [{ modifiers: outcome.effects.flatMap((effect) => effect.steps.flatMap((step) => step.modifiers)), labels: outcome.effects.flatMap((effect) => effect.steps.flatMap((step) => step.labels)) }]
  const duration = outcome.effects.map((effect) => effect.duration).filter(Boolean).join('; ') || null
  return { id: entropy.id('effect', 0), name: row.name, cause: `Dodgeball, ${row.group}, Impact ${row.impact}: ${row.name}`, steps, duration, struckLocation: part, source: { table: 'dodgeball', group: row.group, impact: row.impact, name: row.name } }
}

const hasWound = (outcome: Outcome, stress: number) => outcome.trauma > 0 || stress > 0 || outcome.effects.length > 0

/** The identified wound the GM's service delivers to the target's sheet, effective next round. */
function rowWound(state: CombatState, attack: CombatAttack, row: CombatWoundRow, outcome: Outcome, stress: number, entropy: CombatEntropy): CombatWound[] {
  if (!hasWound(outcome, stress)) return []
  const target = combatantOf(state, defenderOf(attack))
  return [{
    id: entropy.id('wound', 0), target: { kind: target.kind, sheetId: target.sheetId }, originatingRound: state.round, effectiveRound: state.round + 1,
    traumaDelta: outcome.trauma, stressDelta: stress, effect: rowEffect(row, outcome, attack.landing!.part!, entropy),
  }]
}

const isOut = (entry: Combatant, attack: CombatAttack, outcome: Outcome): boolean =>
  (entry.key === defenderOf(attack) && outcome.targetOut) || (entry.key === attack.attackerKey && outcome.throwerOut)

/** The target Out on a wound; the thrower Out when the row says so: caught by the target, or Coach's call. */
function outReason(entry: Combatant, attack: CombatAttack, outcome: Outcome): string | null {
  if (!isOut(entry, attack, outcome)) return entry.outReason
  return outcome.caught ? 'caught' : 'wound'
}

/** The row's result: Out applies at once, the wound queues for the GM, and the attack closes. */
function applyRow(state: CombatState, attack: CombatAttack, outcome: Outcome, stress: number, entropy: CombatEntropy): CombatState {
  const row = attack.row!
  const combatants = state.combatants.map((entry) => ({ ...entry, outReason: outReason(entry, attack, outcome) }))
  const woundOutbox = [...state.woundOutbox, ...rowWound(state, attack, row, outcome, stress, entropy)]
  return closeAttack({ ...state, combatants, woundOutbox }, { ...attack, rowOutcome: outcome.text }, outcome.caught ? 'row-caught' : 'wounded')
}

/** A positive Dodgeball Impact reads its row: an automatic row applies now, a Check or Save waits on the target. */
export function readDodgeballRow(fight: CombatFight, attack: CombatAttack, entropy: CombatEntropy): CombatFight {
  const located = rowOf(attack)
  const withRow = { ...attack, row: storedRow(located) }
  if (located.resolution.kind === 'automatic') return { ...fight, state: applyRow(fight.state, withRow, located.resolution.outcome, located.resolution.outcome.stress, entropy) }
  const action = located.resolution.check.kind === 'save' ? 'save' : 'check'
  return { ...fight, state: { ...fight.state, attack: { ...withRow, step: 'check' }, pendingActions: stepRequest(defenderOf(attack), action) } }
}

/** An ordinary core roll's number: Handle as the sheet caps it, Body as it stands. */
function checkTarget(record: CombatSheet, against: 'Handle' | 'Body', modifiers: ReturnType<typeof combatInputModifiers>): number {
  return against === 'Handle' ? lubecEffectiveHandle(record.sheet, modifiers)! : lubecCurrentValue(record.sheet, against, modifiers)!
}

const failureStress = (record: CombatSheet, kind: LubecCheckKind): number => (kind === 'save' ? 1 : lubecFailedCheckStress(record.sheet))

/** At or under its number, one die, or two kept by Advantage or Disadvantage. */
function rollCheck(record: CombatSheet, check: NonNullable<CombatWoundRow['check']>, target: number, entropy: CombatEntropy): CombatCheckRoll {
  const count = check.advantage === 'normal' ? 1 : 2
  const dice = Array.from({ length: count }, () => entropy.die('check', 100))
  const result = keptLubecRoll(dice, check.advantage as LubecAdvantage)
  const success = result <= target
  return { ...check, target, dice, result, success, stress: success ? 0 : failureStress(record, check.kind) }
}

const CHECK_NAMES = { 'stat-check': 'Check', save: 'Save' } as const

function checkLog(target: Combatant, row: CombatWoundRow, rolled: CombatCheckRoll): CombatLog {
  return {
    event: `${target.name} rolled a ${rolled.against} ${CHECK_NAMES[rolled.kind]}.`, actor: target.key,
    roll: { who: target.name, what: `${rolled.against} ${CHECK_NAMES[rolled.kind]}`, roll: pad(rolled.result), target: `under ${rolled.target}`, tone: rolled.success ? 'ok' : 'bad', result: rolled.success ? 'Success' : 'Failure', extra: row.name },
  }
}

/** A row's catch success puts the ball in the target's first free hand; with none free it lands on the Floor. */
function caughtByRow(attack: CombatAttack, record: CombatSheet, command: CombatCommand) {
  const detached = attack.detached[0]
  if (!detached || !place(record.sheet.gear, 'hands', detached.item as LubecItem).ok) return { attack, sheets: [] }
  // The free hand was checked just above, in this same transaction, so the placement succeeds.
  const arrival = lubecPlaceDetached(record.sheet.gear, detached, { commandId: command.envelope.id, role: 'catch' }, 'hands') as Extract<LubecArrival, { ok: true }>
  return { attack: { ...attack, detached: [] }, sheets: [{ selection: { kind: record.kind, sheetId: record.sheetId }, gear: arrival.gear }] }
}

function checked(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand, entropy: CombatEntropy): CombatPlan {
  const row = attack.row!
  const modifiers = combatInputModifiers(record.sheet, { fightId: command.envelope.fightId, round: fight.state.round })
  const rolled = rollCheck(record, row.check!, checkTarget(record, row.check!.against, modifiers), entropy)
  const located = rowOf(attack).resolution as Extract<LubecLocatedDodgeballRow['resolution'], { kind: 'check' }>
  const outcome = rolled.success ? located.success : located.failure
  const held = outcome.caught ? caughtByRow(attack, record, command) : { attack, sheets: [] }
  const state = applyRow(fight.state, { ...held.attack, check: rolled, repair: null }, outcome, outcome.stress + rolled.stress, entropy)
  return { fight: { ...fight, state }, items: [], logs: [checkLog(combatantOf(fight.state, defenderOf(attack)), row, rolled)], sheets: held.sheets }
}

/** The target rolls the row's Check or Save themselves: an ordinary core roll at or under its number. */
const check: CombatHandler = (command, records, authority, entropy) => {
  const fight = requireLiveContext(command, records, authority)
  const attack = attackAt(fight.state, command, 'check', defenderOf)
  const target = combatantOf(fight.state, defenderOf(attack))
  const record = combatSheetOf(records, target)
  const repair = attackRepair(target, record, true)
  if (repair) return repairPlan(fight, attack, target, repair)
  return checked(fight, attack, record!, command, entropy)
}

export const combatRowHandlers: Readonly<Record<string, CombatHandler>> = { check }
