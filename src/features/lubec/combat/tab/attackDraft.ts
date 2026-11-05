import { sheetPayload } from '../../../character/characterStore/sheetIntentionEdits'
import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import { lubecHeld } from '../../../ruleSets/lubec/gear/held'
import { LUBEC_FISTICUFFS_ID } from '../../fight/lubecFightRequest'
import { lubecFightAttacks, lubecFightFists } from '../../fight/lubecFightWeapons'
import { combatFightingTraining, clampHandle, type CombatAttackSkill } from '../engine/attackMath'
import type { CombatAim, CombatAttack, CombatAttackRange, CombatAttackRoll } from '../engine/types'

/** What the attacker has picked so far; the window sends it as the aim once it is complete. */
export type AttackDraft = { targetKey: string | null; weaponItemId: string | null; attackId: string | null; defense: CombatAim['defense'] }

/** The first held weapon, else Fisticuffs while it is offered, else nothing. */
export function defaultWeapon(sheet: LubecCharacterSheet): string | null {
  const weapon = lubecHeld(sheet.gear).find((held) => held.weapon)
  if (weapon) return weapon.itemId
  const fists = lubecFightFists(sheet.gear, { strength: null, handle: null }, combatFightingTraining(sheet))
  return fists.offered ? LUBEC_FISTICUFFS_ID : null
}

/** The only use a weapon has is chosen for you; with more than one, nothing is. */
export function defaultAttack(sheet: LubecCharacterSheet, weaponItemId: string | null): string | null {
  const attacks = lubecFightAttacks(sheet.gear, weaponItemId, combatFightingTraining(sheet))
  return attacks.length === 1 ? attacks[0].id : null
}

/** The persisted aim, or the window's first guess: the first opponent, the first weapon and its only use. */
export function initialDraft(attack: CombatAttack, sheet: LubecCharacterSheet | null, opponents: readonly string[]): AttackDraft {
  if (attack.aim) return attack.aim
  const weaponItemId = sheet ? defaultWeapon(sheet) : null
  return { targetKey: opponents[0] ?? null, weaponItemId, attackId: sheet ? defaultAttack(sheet, weaponItemId) : null, defense: null }
}

export const completeAim = (draft: AttackDraft): CombatAim | null =>
  (draft.targetKey && draft.weaponItemId && draft.attackId ? draft as CombatAim : null)

/** Key order is not part of an aim: Firestore hands maps back sorted. */
export const sameAim = (a: CombatAim | null | undefined, b: CombatAim | null): boolean =>
  sheetPayload(a ?? null) === sheetPayload(b)

/** A new weapon takes its only use. */
export function withWeapon(draft: AttackDraft, sheet: LubecCharacterSheet, weaponItemId: string): AttackDraft {
  return { ...draft, weaponItemId, attackId: defaultAttack(sheet, weaponItemId) }
}

/** A Defense line moved to `amount` (in tens); 0 removes the line, and it never takes the whole pool. */
export function withDefense(draft: AttackDraft, amount: number, total: number, against: string): AttackDraft {
  const top = Math.floor((total - 1) / 10) * 10
  const tens = Math.max(0, Math.min(top, Math.round(amount / 10) * 10))
  return { ...draft, defense: tens > 0 ? { against: draft.defense?.against ?? against, amount: tens } : null }
}

export type AttackSegments = { defense: number; attackFrom: number; attackWidth: number; edge: number; attackNumber: number }

/** The bar: Defense from 0, the attack after it, the range moving only the attack's end, and the unused rest. */
export function attackSegments(total: number, defense: number, range: CombatAttackRange | null | undefined): AttackSegments {
  const attackNumber = total - defense + (range?.modifier ?? 0)
  const edge = clampHandle(Math.max(defense, defense + attackNumber))
  return { defense, attackFrom: defense, attackWidth: edge - defense, edge, attackNumber }
}

/** Where a button or label sits over a segment: its middle, kept inside the bar. */
export const segmentMiddle = (from: number, width: number): number => Math.max(8, Math.min(92, from + width / 2))

export type AttackSum = { handle: number; skill: CombatAttackSkill | null; total: number }

/** "Handle 46 + Throwing Arm 10 − Range 20 =": the bar's whole pool, as the mock-up sums it. */
const skillTerm = (skill: CombatAttackSkill | null): string[] => (skill ? [`+ ${skill.name} ${skill.bonus}`] : [])

function rangeTerm(range: CombatAttackRange | null): string[] {
  const modifier = range?.modifier ?? 0
  if (!modifier) return []
  return [`${modifier < 0 ? '−' : '+'} Range ${Math.abs(modifier)}`]
}

export function attackSum({ handle, skill }: AttackSum, range: CombatAttackRange | null): string {
  return `${[`Handle ${handle}`, ...skillTerm(skill), ...rangeTerm(range)].join(' ')} =`
}

/** Where on the bar, 0 to 100, a pointer at `clientX` sits. */
export const barPercent = (bar: Pick<DOMRect, 'left' | 'width'>, clientX: number): number =>
  ((clientX - bar.left) / bar.width) * 100

/** A label sits over its segment's middle, pinned to the bar's end when the middle is within 5 of it. */
export function labelPlace(from: number, width: number): { left: number; edge: string } {
  const middle = from + width / 2
  if (middle < 5) return { left: 0, edge: 'at-start' }
  if (middle > 95) return { left: 100, edge: 'at-end' }
  return { left: middle, edge: '' }
}

/** The attack segment's colour once rolled: a success or a failure, flashing on a double. */
export function outcomeClass(roll: CombatAttackRoll | null | undefined): string {
  if (!roll) return ''
  return `${roll.critical ? 'double ' : ''}${roll.hit ? 'success' : 'failure'}`
}

/** A d100 roll as the table writes it: two digits. */
export const rollText = (value: number): string => String(value).padStart(2, '0')
