// The item card's facts, copied from the inventory prototype (B's
// openActDialog): what the item is and what it does where it is. A weapon's
// own lines are in weaponFacts; a carrier's come with carriers.

import { HOLD, holds, holdWay, isBox, KIND_NAMES, locSummary, RULES, SIZE_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecGear, LubecItem, LubecSupply } from '../../ruleSets/lubec/gear/gearRecord'
import { onYou } from '../../ruleSets/lubec/gear/placement'
import { stackMates } from '../../ruleSets/lubec/gear/stacks'
import { lubecAmmoOnYou, lubecLooseOf } from '../../ruleSets/lubec/gear/supplies'
import { qtyText, whereText } from './gearLabels'
import { armorAll, armorVs, WEIGHT_NAMES, WOUND_KINDS } from './itemLabels'
import { lubecWeaponFacts, type LubecCardFact, type LubecWeaponFacts } from './weaponFacts'
import type { LubecWielder } from '../../ruleSets/lubec/gear/minStrength'

export type { LubecCardFact } from './weaponFacts'

type Facts = LubecWeaponFacts

const nameOf = (supplies: readonly LubecSupply[], sid: string | undefined) => supplies.find((s) => s.id === sid)?.name ?? 'no supply'

const fact = (term: string, text: string, step?: LubecCardFact['step']): LubecCardFact => (step ? { term, text, step } : { term, text })

/** The card's eyebrow: the kind, and where it is. */
export const cardEyebrow = (i: LubecItem): string => `${KIND_NAMES[i.kind]} / ${whereText(i)}`

/** The card's title: the name, and how many unless it counts down. */
export const cardTitle = (i: LubecItem): string => `${i.name} ${i.kind === 'consumable' ? '' : qtyText(i)}`.trim()

function sizeFact(i: LubecItem): LubecCardFact {
  if (i.size === 0) return fact('Size', ['hands', 'body'].includes(i.carrier) ? 'Small; held or on the body it takes that slot' : 'Small, takes no slot in a bag')
  return fact('Size', `${SIZE_NAMES[i.size]}, ${i.size} slot${i.size > 1 ? 's; takes both hands to hold' : ''}`)
}

// Rules E1 and E2: a heavy or extra heavy thing's effect while it's on you, from its recorded Strength roll.
function weightEffect(i: LubecItem): string {
  if (!onYou(i)) return 'No effect while it stays here.'
  if (!i.check) return 'Strength roll not recorded.'
  if (i.weight === 'extra') return `Strength passed: Speed −${RULES.extraPass}, always.`
  return i.check === 'fail' ? `Strength failed: Speed −${RULES.heavyFail}.` : 'Strength passed: no penalty.'
}

// A heavy thing on you carries the switch that records, or overrides, its Strength roll.
function weightFact(i: LubecItem): LubecCardFact {
  if (i.weight === 'normal') return fact('Weight', WEIGHT_NAMES.normal)
  const line = fact('Weight', `${WEIGHT_NAMES[i.weight]}, so it takes both hands to hold. ${weightEffect(i)}`)
  return onYou(i) ? { ...line, check: true } : line
}

// Rule S3: a stack's room, and which of its batch it is.
function stackFact({ gear, item: i }: Facts): LubecCardFact[] {
  if (!(i.size > 0 && (i.per ?? 0) > 1)) return []
  const mates = stackMates(gear.items, i)
  const all = mates.reduce((n, x) => n + x.qty, 0)
  const which = mates.length > 1 ? ` This is ${mates.findIndex((x) => x.id === i.id) + 1} of ${mates.length} stacks, ${all} in all.` : ''
  return [fact('Stack', `${i.per} fit in ${i.size === 1 ? 'one slot' : `${i.size} slots`}.${which}`)]
}

// Rule E3: any 8-slot thing on you.
const encumberingFact = (i: LubecItem): LubecCardFact[] =>
  (i.size === 8 ? [fact('Encumbering', onYou(i) ? `Yes. Speed −${RULES.encumbering} while it's on you.` : 'Only on you.')] : [])

/** What a supply goes into, for the card: "D batteries / fits Flashlight". */
function supplyFact({ gear, supplies }: Facts, sid: string | undefined): string {
  const into = gear.items.filter((x) => holds(x) && !isBox(x) && x.takes === sid).map((x) => x.name)
  return `${nameOf(supplies, sid)}${into.length ? ` / fits ${into.join(', ')}` : ''}`
}

// Rule K4: a consumable's count steps down to used up; Rule L10: a loose supply says what it fits.
function countFacts(f: Facts): LubecCardFact[] {
  const i = f.item
  if (i.kind === 'consumable') return [fact('Left', String(i.qty), 'qty'), ...(i.fits ? [fact('Supply', supplyFact(f, i.fits))] : [])]
  return i.qty !== 1 ? [fact('How many', String(i.qty))] : []
}

function holdsText(f: Facts): string {
  const i = f.item
  if (isBox(i)) return supplyFact(f, i.takes)
  return `${nameOf(f.supplies, i.takes)}${lubecLooseOf(f.supplies, i.takes) ? ` / ${lubecAmmoOnYou(f.gear, i)} more on you` : ''}`
}

// Rule K5: a holder's contents step between empty and full, and it stays at 0.
const holderFacts = (f: Facts): LubecCardFact[] => [
  fact(HOLD[holdWay(f.item)].fact, `${f.item.loaded ?? 0} of ${f.item.capacity ?? 0}`, 'loaded'),
  fact('Holds', holdsText(f)),
]

// Rules A1, A2 and E6.
function armorFacts(i: LubecItem): LubecCardFact[] {
  const hands = (i.locs ?? []).filter((k) => k.startsWith('hand-')).length
  return [
    fact('Armor', WOUND_KINDS.some((w) => armorVs(i, w)) ? `${armorAll(i)}, off Impact on each part it covers` : 'None (it only takes layers)'),
    fact('Covers', locSummary(i.locs ?? [])),
    fact('Layers', i.exclusive ? 'Exclusive: every layer where it covers' : 'Ordinary: one layer at each place'),
    ...(hands ? [fact('Handle', `−${RULES.handArmorHandle * (i.exclusive ? RULES.layers.hand : 1)} on each covered hand while worn`)] : []),
  ]
}

const KIND_FACTS: Partial<Record<LubecItem['kind'], (f: Facts) => LubecCardFact[]>> = {
  weapon: lubecWeaponFacts,
  holder: holderFacts,
  armor: (f) => armorFacts(f.item),
}

/** The card's facts, in B's order: size, weight, stack, encumbering, the count, the kind's own, and where it is. A weapon's read the wielder's Strength and Handle. */
export function lubecCardFacts(gear: LubecGear, item: LubecItem, supplies: readonly LubecSupply[], wielder: LubecWielder): LubecCardFact[] {
  const f = { gear, item, supplies, wielder }
  return [
    sizeFact(item), weightFact(item), ...stackFact(f), ...encumberingFact(item), ...countFacts(f),
    ...(KIND_FACTS[item.kind]?.(f) ?? []), fact('Where', whereText(item)),
  ]
}
