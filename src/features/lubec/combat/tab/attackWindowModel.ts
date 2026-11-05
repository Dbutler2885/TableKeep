import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import { lubecCombatantKey, type LubecCombatant } from '../../fight/lubecFightRequest'
import { combatAttackReading, type CombatAttackSkill } from '../engine/attackMath'
import { combatOpponents } from '../engine/attackParty'
import { combatInputModifiers } from '../engine/inputModifiers'
import type { CombatAim, CombatAttack, CombatAttackRange, Combatant, CombatFrozenAim, CombatState } from '../engine/types'
import { attackSegments, completeAim, sameAim, type AttackDraft, type AttackSegments } from './attackDraft'
import { combatFightCombatant, type CombatRosterRecords } from './combatFightCombatants'

export type AttackReading = { handle: number; skill: CombatAttackSkill | null; total: number; ranged: boolean }

/** Whether the table already holds exactly this aim, with its frozen numbers. */
export const heldAim = (attack: CombatAttack, aim: CombatAim | null): boolean => attack.frozen != null && sameAim(attack.aim, aim)

const frozenReading = (frozen: CombatFrozenAim): AttackReading =>
  ({ handle: frozen.handle, skill: frozen.skill, total: frozen.total, ranged: frozen.choice.ranged === true })

function sheetReading(sheet: LubecCharacterSheet, aim: CombatAim, context: { fightId: string; round: number }): AttackReading | null {
  const reading = combatAttackReading(sheet, combatInputModifiers(sheet, context), aim.weaponItemId, aim.attackId)
  return reading && { handle: reading.handle, skill: reading.skill, total: reading.total, ranged: reading.choice.ranged === true }
}

/** The frozen numbers once the table holds this exact aim; until then the same reading from the sheet in hand. */
export function windowReading(attack: CombatAttack, aim: CombatAim | null, sheet: LubecCharacterSheet, context: { fightId: string; round: number }): AttackReading | null {
  if (!aim) return null
  return heldAim(attack, aim) ? frozenReading(attack.frozen!) : sheetReading(sheet, aim, context)
}

/** A throw or shot rolls only once the GM has ranged the very aim the table holds. */
export function rollReady(attack: CombatAttack, aim: CombatAim | null, reading: AttackReading | null): boolean {
  if (!reading) return false
  return !reading.ranged || (heldAim(attack, aim) && attack.range != null)
}

export type AttackWindowInput = {
  state: CombatState
  fightId: string
  attack: CombatAttack
  attacker: Combatant
  roster: CombatRosterRecords
  sheet: LubecCharacterSheet
  draft: AttackDraft
}

/** The bar and the ask over it: there only once a complete aim reads as numbers against a target. */
export type AttackSplit = { reading: AttackReading; segments: AttackSegments; target: LubecCombatant }

export type AttackWindowModel = {
  aim: CombatAim | null
  held: boolean
  reading: AttackReading | null
  range: CombatAttackRange | null
  split: AttackSplit | null
  ready: boolean
  opponents: Combatant[]
  targets: LubecCombatant[]
  target: LubecCombatant | null
}

const readable = (entry: LubecCombatant | null): entry is LubecCombatant => entry !== null

const heldRange = (attack: CombatAttack, held: boolean): CombatAttackRange | null => (held ? attack.range ?? null : null)

function windowSplit(reading: AttackReading | null, target: LubecCombatant | null, draft: AttackDraft, range: CombatAttackRange | null): AttackSplit | null {
  if (!reading || !target) return null
  return { reading, target, segments: attackSegments(reading.total, draft.defense?.amount ?? 0, range) }
}

const windowTarget = (targets: readonly LubecCombatant[], key: string | null): LubecCombatant | null =>
  targets.find((entry) => lubecCombatantKey(entry) === key) ?? null

/** Everything the attack window shows, from the fight, the sheet in hand and the attacker's draft. */
export function attackWindowModel({ state, fightId, attack, attacker, roster, sheet, draft }: AttackWindowInput): AttackWindowModel {
  const aim = completeAim(draft)
  const held = heldAim(attack, aim)
  const reading = windowReading(attack, aim, sheet, { fightId, round: state.round })
  const range = heldRange(attack, held)
  const opponents = combatOpponents(state, attacker)
  const targets = opponents.map((entry) => combatFightCombatant(entry, roster)).filter(readable)
  const target = windowTarget(targets, draft.targetKey)
  return { aim, held, reading, range, opponents, targets, target, ready: rollReady(attack, aim, reading), split: windowSplit(reading, target, draft, range) }
}
