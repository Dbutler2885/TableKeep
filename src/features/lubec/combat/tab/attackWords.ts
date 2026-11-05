import type { Role } from '../../../../types/app'
import type { LubecRangeBand, LubecWeaponRange } from '../../../ruleSets/lubec/gear/gearRecord'
import { combatBandName, combatSigned } from '../engine/attackAim'
import type { CombatAim, CombatAttack, CombatAttackRoll, Combatant, CombatFrozenAim, CombatState } from '../engine/types'
import { rollText } from './attackDraft'

/** A combatant's name as the fight publishes it. */
export const combatantName = (state: CombatState, key: string | undefined) => state.combatants.find((entry) => entry.key === key)?.name ?? ''

/** "Throw with Dodgeball at Roy Carver. ATK 36; Defense 20 against Roy Carver." from what the table holds. */
const defenseWords = (state: CombatState, defense: CombatAim['defense']): string =>
  (defense ? `; Defense ${defense.amount} against ${combatantName(state, defense.against)}` : '')

export function attackLine(state: CombatState, attack: CombatAttack): string {
  const { aim, frozen } = attack
  if (!aim || !frozen) return 'Choosing a target and a weapon.'
  const number = frozen.attack + (attack.range?.modifier ?? 0)
  return `${frozen.choice.name} with ${frozen.weaponName} at ${combatantName(state, aim.targetKey)}. ATK ${number}${defenseWords(state, aim.defense)}.`
}

/** The fight waits on the GM while a ranged aim has no range yet; otherwise on the attacker. */
export const waitsOnGm = (attack: CombatAttack) => attack.frozen?.choice.ranged === true && !attack.range


export type CombatViewer = { role: Role | null; userId: string; actingFor: string | null }

/** Who works this attacker's controls: the owner, the GM for an NPC, or the GM explicitly acting for an absent player. */
export function controlsAttacker(attacker: Combatant, viewer: CombatViewer): boolean {
  if (attacker.kind === 'npc') return viewer.role === 'gm'
  return attacker.ownerUserId === viewer.userId || (viewer.role === 'gm' && viewer.actingFor === attacker.key)
}

export const bandOf = (ranges: readonly LubecWeaponRange[], band: LubecRangeBand): LubecWeaponRange | undefined =>
  ranges.find((entry) => entry.band === band)

/** "Medium −10" from the weapon's own number; a band it does not number is the band's name alone. */
export function bandLabel(ranges: readonly LubecWeaponRange[], band: LubecRangeBand): string {
  const modifier = bandOf(ranges, band)?.modifier
  return modifier === undefined ? combatBandName(band) : `${combatBandName(band)} ${combatSigned(modifier)}`
}

/** The band shown pressed to the GM: the declared one, or else the last band used for this attacker, still to confirm. */
export const pressedBand = (attack: CombatAttack, remembered: LubecRangeBand | undefined): LubecRangeBand | undefined =>
  attack.range?.band ?? remembered

/** A thrown object, as against a blow up close or a shot. */
export const isThrow = (frozen: CombatFrozenAim): boolean => frozen.choice.ranged === true && frozen.choice.firearm !== true

export function attackVerdict(roll: CombatAttackRoll): string {
  if (!roll.hit) return `A miss: ${rollText(roll.roll)} is not under ${roll.attackNumber}.`
  return `A hit${roll.critical ? ', a critical' : ''}. Attack Quality ${roll.quality}.`
}

export function missWords(attacker: string, frozen: CombatFrozenAim): string {
  if (!isThrow(frozen)) return `${attacker}'s attack misses.`
  return `${attacker}'s throw goes wide. The ${frozen.weaponName.toLowerCase()} left the hand at the Roll and lands on the Floor.`
}

/** What follows a result: more cards while it runs; then the next turn, or before initiative the GM's next grant. */
export function resultFoot(attack: CombatAttack, round: number): string {
  if (!attack.closed) return 'Every roll lands on every screen as a card, then settles into the ticker.'
  return round ? 'The next turn opens by itself.' : 'The GM may grant another Sneak Attack, or roll initiative.'
}
