import type { LubecItem, LubecWoundKind } from './gearRecord'

export type LubecAttackChoice = {
  id: string
  name: string
  start: string
  groundedStart?: string
  wound: string
  armor: LubecWoundKind
  str: boolean
  skill: 'fighting' | 'shooting' | 'throwing'
  melee?: boolean
  ranged?: boolean
  feet?: boolean
  firearm?: boolean
  impact: number
}

type Definition = Omit<LubecAttackChoice, 'id' | 'impact'>

/** Attack metadata copied from the attack prototype's MODES table. */
export const LUBEC_ATTACK_TYPES = {
  punch: { name: 'Punch', start: 'punch', wound: 'fisticuffs', armor: 'blunt', str: true, skill: 'fighting', melee: true },
  kick: { name: 'Kick', start: 'kick', groundedStart: 'kickDown', wound: 'fisticuffs', armor: 'blunt', str: true, skill: 'fighting', melee: true, feet: true },
  swing: { name: 'Blunt swing', start: 'swing', groundedStart: 'swingDown', wound: 'blunt', armor: 'blunt', str: true, skill: 'fighting', melee: true },
  slash: { name: 'Slash', start: 'slash', wound: 'cutting', armor: 'cut', str: true, skill: 'fighting', melee: true },
  stab: { name: 'Stab', start: 'stab', wound: 'piercing', armor: 'pierce', str: true, skill: 'fighting', melee: true },
  throw: { name: 'Throw', start: 'thrown', wound: 'thrown', armor: 'blunt', str: true, skill: 'throwing', ranged: true },
  throwEdge: { name: 'Throw', start: 'thrown', wound: 'cutting', armor: 'cut', str: true, skill: 'throwing', ranged: true },
  shoot: { name: 'Shoot', start: 'firearm', wound: 'gunshot', armor: 'gun', str: false, skill: 'shooting', ranged: true, firearm: true },
} as const satisfies Record<string, Definition>

const MELEE_ATTACK = { blunt: 'swing', cut: 'slash', pierce: 'stab', gun: 'shoot' } as const
const WOUND_TABLE = { blunt: 'thrown', cut: 'cutting', pierce: 'piercing', gun: 'gunshot' } as const

const choice = (id: keyof typeof LUBEC_ATTACK_TYPES, impact: number): LubecAttackChoice => ({ id, ...LUBEC_ATTACK_TYPES[id], impact })
const woundsOf = (item: LubecItem): LubecWoundKind[] => item.wounds?.length ? item.wounds : ['blunt']

const throwWound = (item: LubecItem): LubecWoundKind => item.mode !== 'thrown' ? item.thrownWound ?? 'blunt' : woundsOf(item)[0]
const throwImpact = (item: LubecItem): number => item.mode !== 'thrown' ? item.thrownImpact ?? 0 : item.impact ?? 0

function thrownChoice(item: LubecItem): LubecAttackChoice {
  const wound = throwWound(item)
  return { ...choice('throw', throwImpact(item)), armor: wound, wound: item.table ?? WOUND_TABLE[wound] }
}

const shootChoice = (item: LubecItem): LubecAttackChoice => ({ ...choice('shoot', item.impact ?? 0), wound: item.table ?? 'gunshot' })

const meleeChoice = (item: LubecItem, wound: LubecWoundKind): LubecAttackChoice =>
  ({ ...choice(MELEE_ATTACK[wound], item.impact ?? 0), wound: item.table ?? LUBEC_ATTACK_TYPES[MELEE_ATTACK[wound]].wound })

const meleeChoices = (item: LubecItem): LubecAttackChoice[] => [
  ...woundsOf(item).map((wound) => meleeChoice(item, wound)),
  ...(item.canThrow ? [thrownChoice(item)] : []),
]

const MODE_CHOICES = { melee: meleeChoices, thrown: (item: LubecItem) => [thrownChoice(item)], firearm: (item: LubecItem) => [shootChoice(item)] }

/** Fisticuffs has Punch and Kick; weapons offer their checked uses and, when enabled, one fixed Throw. */
export function lubecWeaponAttacks(item: LubecItem | null): LubecAttackChoice[] {
  if (!item) return [choice('punch', 0), choice('kick', 0)]
  if (item.kind !== 'weapon') return []
  return MODE_CHOICES[item.mode ?? 'melee'](item)
}
