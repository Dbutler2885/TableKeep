import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import { lubecCurrentValue, lubecEffectiveHandle, type LubecModifier } from '../../../ruleSets/lubec/derivations'
import { lubecAttackHandle } from '../../../ruleSets/lubec/gear/handPenalty'
import { lubecFisticuffsHands, lubecHeld, type LubecHands } from '../../../ruleSets/lubec/gear/held'
import type { LubecAttackChoice } from '../../../ruleSets/lubec/gear/weaponAttacks'
import { lubecSkillBonus } from '../../../ruleSets/lubec/skills'
import { LUBEC_FISTICUFFS_ID } from '../../fight/lubecFightRequest'
import { lubecFightAttack } from '../../fight/lubecFightWeapons'

/** The skill each kind of attack adds, best first: fighting for melee, shooting for a gun, Throwing Arm for a throw. */
const ATTACK_SKILLS: Readonly<Record<LubecAttackChoice['skill'], readonly string[]>> = {
  fighting: ['Boxing', 'Scrapping'],
  shooting: ['Firearms'],
  throwing: ['Throwing Arm'],
}

export type CombatAttackSkill = { name: string; bonus: number }

const ownedSkills = (sheet: Pick<LubecCharacterSheet, 'skills'>): string[] => [sheet.skills.free, ...sheet.skills.picked].filter((name): name is string => name !== null)

/** The attack's skill the sheet has, or null: a missing skill adds nothing, as its existing rules say. */
export function combatAttackSkill(sheet: Pick<LubecCharacterSheet, 'skills'>, skill: LubecAttackChoice['skill']): CombatAttackSkill | null {
  const owned = ownedSkills(sheet)
  const name = ATTACK_SKILLS[skill].find((candidate) => owned.includes(candidate))
  return name ? { name, bonus: lubecSkillBonus(name) ?? 0 } : null
}

/** Scrapping and Boxing are the trained and expert fighting skills. */
export const combatFightingTraining = (sheet: Pick<LubecCharacterSheet, 'skills'>): boolean =>
  combatAttackSkill(sheet, 'fighting') !== null

/** The hands an attack is made with: the weapon's own, or Fisticuffs' free hands. */
function attackHands(sheet: LubecCharacterSheet, weaponItemId: string): LubecHands {
  if (weaponItemId === LUBEC_FISTICUFFS_ID) return lubecFisticuffsHands(sheet.gear) ?? 'both'
  return lubecHeld(sheet.gear).find((held) => held.itemId === weaponItemId)?.hands ?? 'both'
}

const weaponOf = (sheet: LubecCharacterSheet, weaponItemId: string) =>
  sheet.gear.items.find((item) => item.id === weaponItemId) ?? null

export type CombatAttackReading = {
  choice: LubecAttackChoice
  handle: number
  skill: CombatAttackSkill | null
  /** Handle after gloves and minimum Strength, plus the skill, capped 0 to 100. */
  total: number
}

export const clampHandle = (value: number): number => Math.max(0, Math.min(100, value))

/** The attack Handle a weapon and use give, or null when the use is not legal now or Handle is a hole. */
export function combatAttackReading(sheet: LubecCharacterSheet, modifiers: readonly LubecModifier[], weaponItemId: string, attackId: string): CombatAttackReading | null {
  const choice = lubecFightAttack(sheet.gear, weaponItemId, combatFightingTraining(sheet), attackId)
  if (!choice) return null
  const wielder = { strength: lubecCurrentValue(sheet, 'Strength', modifiers), handle: lubecEffectiveHandle(sheet, modifiers) }
  const handle = lubecAttackHandle(wielder, sheet.gear, { weapon: weaponOf(sheet, weaponItemId), hands: attackHands(sheet, weaponItemId) }).total
  if (handle === null) return null
  const skill = combatAttackSkill(sheet, choice.skill)
  return { choice, handle, skill, total: clampHandle(handle + (skill?.bonus ?? 0)) }
}

export type CombatAttackResult = { roll: number; attackNumber: number; hit: boolean; critical: boolean; quality: number | null }

const tens = (value: number): number => Math.floor(value / 10)

/** Strictly under the attack number; a successful double takes the attack number's tens digit as Quality. */
export function combatAttackResult(roll: number, attackNumber: number): CombatAttackResult {
  const hit = roll < attackNumber
  const critical = hit && roll % 11 === 0
  return { roll, attackNumber, hit, critical, quality: hit ? tens(critical ? attackNumber : roll) : null }
}
