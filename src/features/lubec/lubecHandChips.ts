// The Fight bar's "In hand" row (spec 10.6), worked out from Gear: a chip for
// each hand, left first, or one for both; then Fisticuffs while a hand is
// free. With both hands full of things that are not weapons, Fisticuffs is
// greyed and each held thing can be dropped, which is free from a hand. The
// wording of hands follows B's Hands panel.

import type { LubecGear } from '../ruleSets/lubec/gear/gearRecord'
import { lubecAttackHandle, type LubecAttackHandle } from '../ruleSets/lubec/gear/handPenalty'
import { lubecFisticuffsHands, lubecHandsFullOfThings, lubecHeld, type LubecHands, type LubecHeld } from '../ruleSets/lubec/gear/held'
import type { LubecWielder } from '../ruleSets/lubec/gear/minStrength'

/** One chip of "In hand": a thing held, an empty hand, or Fisticuffs, offered or greyed. A weapon's chip carries its attack's Handle. */
export type LubecHandChip =
  | { kind: 'held'; held: LubecHeld; text: string; attack: LubecAttackHandle | null; droppable: boolean }
  | { kind: 'empty'; text: string }
  | { kind: 'fisticuffs'; attack: LubecAttackHandle }
  | { kind: 'fisticuffs-greyed'; text: string }

/** What each hand is called. */
export const HAND_NAMES: Readonly<Record<LubecHands, string>> = { left: 'Left hand', right: 'Right hand', both: 'Both hands' }

/** "Left hand: Grandpa's revolver, 0 of 6". */
export const lubecHeldText = (h: LubecHeld): string =>
  `${HAND_NAMES[h.hands]}: ${h.name}${h.loaded ? `, ${h.loaded.now} of ${h.loaded.capacity}` : ''}`

const EMPTY: LubecHandChip = { kind: 'empty', text: 'Empty hand' }

type Reading = { gear: LubecGear; wielder: LubecWielder; droppable: boolean }

function heldChip({ gear, wielder, droppable }: Reading, h: LubecHeld): LubecHandChip {
  const weapon = h.weapon ? gear.items.find((i) => i.id === h.itemId) ?? null : null
  const attack = weapon && lubecAttackHandle(wielder, gear, { weapon, hands: h.hands })
  return { kind: 'held', held: h, text: lubecHeldText(h), attack, droppable }
}

// One chip for a thing in both hands, else one for each hand, left first.
function handChips(r: Reading): LubecHandChip[] {
  const held = lubecHeld(r.gear)
  const both = held.find((h) => h.hands === 'both')
  if (both) return [heldChip(r, both)]
  return (['left', 'right'] as const).map((hand) => {
    const h = held.find((x) => x.hands === hand)
    return h ? heldChip(r, h) : EMPTY
  })
}

function fisticuffsChips(r: Reading): LubecHandChip[] {
  const hands = lubecFisticuffsHands(r.gear)
  if (hands) return [{ kind: 'fisticuffs', attack: lubecAttackHandle(r.wielder, r.gear, { weapon: null, hands }) }]
  return r.droppable ? [{ kind: 'fisticuffs-greyed', text: 'Hands full: drop something first' }] : []
}

/** "In hand", in order: the hands, left first, then Fisticuffs while a hand is free or greyed while both hold things that are not weapons. */
export function lubecHandChips(gear: LubecGear, wielder: LubecWielder): LubecHandChip[] {
  const r = { gear, wielder, droppable: lubecHandsFullOfThings(gear) }
  return [...handChips(r), ...fisticuffsChips(r)]
}
