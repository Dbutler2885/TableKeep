import type { LubecItem, LubecWeaponRange } from '../../ruleSets/lubec/gear/gearRecord'
import { canBeThrown } from './throwableFields'
import { lubecCatchRule } from './catchLabels'
import { sgn, WOUNDS } from './itemLabels'
import type { LubecCardFact } from './weaponFacts'

const catchFacts = (item: LubecItem): LubecCardFact[] => [
  { term: 'Catch', text: item.catchChance ? `${item.catchChance}%` : 'Cannot be caught' },
  ...lubecCatchRule(item).map((text) => ({ term: 'Catch rule', text })),
]

const thrownDamageFacts = (item: LubecItem): LubecCardFact[] => item.mode === 'melee' ? [
  { term: 'Thrown Impact', text: `Quality ${sgn(item.thrownImpact ?? 0)} base + Strength roll` },
  { term: 'Thrown wounds', text: `${WOUNDS[item.thrownWound ?? 'blunt']}. Armor counts that number.` },
] : []

const rangeText = (range: LubecWeaponRange): string => [
  range.distance ?? 'GM declares distance',
  range.modifier === undefined ? 'GM declares Handle modifier' : `Handle ${sgn(range.modifier)}`,
].join(' · ')

const rangeFacts = (item: LubecItem): LubecCardFact[] => (item.ranges ?? []).map((range) => ({
  term: `${range.band[0].toUpperCase()}${range.band.slice(1)} range`, text: rangeText(range),
}))

export const lubecThrowableFacts = (item: LubecItem): LubecCardFact[] => {
  if (canBeThrown(item)) return [...thrownDamageFacts(item), ...catchFacts(item), ...rangeFacts(item)]
  return item.mode === 'firearm' ? rangeFacts(item) : []
}
