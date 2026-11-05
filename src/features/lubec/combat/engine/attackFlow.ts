import type { LubecWoundKind } from '../../../ruleSets/lubec/gear/gearRecord'
import type { LubecArmorZone } from '../../fight/lubecNpcFightSummary'
import type { CombatPendingAction } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { lubecLandingPart, lubecPairedRegion, lubecStartRegion } from './hitLocation'
import { readDodgeballRow } from './attackRow'
import { settleCombatAttack } from './settlement'
import type { CombatAttack, CombatAttackOutcome, CombatFight, CombatFrozenAim, CombatImpact, CombatLanding, CombatState } from './types'

export const tens = (value: number): number => Math.floor(value / 10)
export const pad = (value: number): string => String(value).padStart(2, '0')
export const signed = (value: number): string => (value < 0 ? `−${-value}` : `+${value}`)

/** The app rolls where an unstopped hit lands: d100 on the attack's start table, then d10 for a paired part's side. */
export function rollLanding(frozen: CombatFrozenAim, entropy: CombatEntropy): CombatLanding {
  const table = frozen.choice.start
  const startRoll = entropy.die('landing', 100)
  const region = lubecStartRegion(table, startRoll)
  const sideRoll = lubecPairedRegion(region) ? entropy.die('side', 10) : null
  return { table, startRoll, sideRoll, start: lubecLandingPart(region, sideRoll ?? 0), part: null, moved: 0 }
}

/** The step that waits on someone, and who. */
export const stepRequest = (combatantKey: string, action: CombatPendingAction['action']): CombatPendingAction[] => [{ combatantKey, action }]

/** An unstopped hit goes to its landing, with `net` quality left as reach. */
export function toLocation(state: CombatState, attack: CombatAttack, net: number, entropy: CombatEntropy): CombatState {
  const landing = rollLanding(attack.frozen!, entropy)
  return { ...state, attack: { ...attack, step: 'location', net, landing }, pendingActions: stepRequest(attack.attackerKey, 'location') }
}

/** The sequence ends: the object still in flight lands on the Floor, and nothing waits any more. */
export const closeAttack = (state: CombatState, attack: CombatAttack, outcome: CombatAttackOutcome): CombatState =>
  settleCombatAttack({ ...state, attack: { ...attack, step: 'done', outcome }, pendingActions: [] })

/** What the target wears on that part against that kind of wound, from its public summary. */
export const armorAtPart = (zones: readonly LubecArmorZone[], part: string, kind: LubecWoundKind): number =>
  zones.find((zone) => zone.locs.includes(part))?.armor[kind] ?? 0

/** Impact = quality left + base Impact + Strength's bonus - steps moved - armor at that part for that wound. */
export function combatImpact(attack: CombatAttack, armor: readonly LubecArmorZone[], strength: number | null): CombatImpact {
  const { choice } = attack.frozen!
  const landing = attack.landing!
  const worn = armorAtPart(armor, landing.part!, choice.armor)
  const total = attack.net! + choice.impact + (strength ?? 0) - landing.moved - worn
  return { quality: attack.net!, base: choice.impact, strength, moved: landing.moved, armor: worn, total, table: choice.wound }
}

/** Where Impact leaves the attack: no wound at 0 or less, Dodgeball waits on its table, any other table is the GM's to record. */
function impactOutcome(impact: CombatImpact): CombatAttackOutcome {
  if (impact.total <= 0) return 'no-wound'
  return impact.table === 'dodgeball' ? 'pending-wound' : 'manual'
}

export function finishImpact(fight: CombatFight, attack: CombatAttack, strength: number | null, entropy: CombatEntropy): CombatFight {
  const target = fight.state.combatants.find((entry) => entry.key === attack.aim!.targetKey)!
  const impact = combatImpact(attack, target.armor, strength)
  const outcome = impactOutcome(impact)
  const done = { ...attack, impact, outcome }
  if (outcome !== 'pending-wound') return { ...fight, state: closeAttack(fight.state, done, outcome) }
  return readDodgeballRow(fight, done, entropy)
}

export const impactWords = (impact: CombatImpact): string =>
  `Impact ${impact.total} = quality ${impact.quality} ${signed(impact.base)} base${impact.strength === null ? '' : ` ${signed(impact.strength)} Strength`} − ${impact.moved} moved − ${impact.armor} armor.`
