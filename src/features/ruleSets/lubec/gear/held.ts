// What the hands hold, for the Fight bar and the fight modal (spec 10.6): one
// read-only list, left hand first, and the count of free hands. Fisticuffs is
// not an item but a weapon every character has, offered while a hand is free;
// dropping what you hold is free (the attack prototype's rule). Pure: gear in.

import type { LubecGear, LubecItem } from './gearRecord'
import { bothHands, handsTaken, itemsIn } from './placement'

/** Which hand holds a thing: slot 0 is the left, slot 1 the right, and a thing Rule W3 says takes both, both. */
export type LubecHands = 'left' | 'right' | 'both'

/** A thing in hand, as the Fight bar and the fight modal read it. */
export type LubecHeld = {
  itemId: string
  name: string
  hands: LubecHands
  /** kind === 'weapon' */
  weapon: boolean
  /** A firearm's rounds. */
  loaded?: { now: number; capacity: number }
}

const SLOT_HANDS: readonly LubecHands[] = ['left', 'right']

const handsOf = (i: LubecItem): LubecHands | undefined => (bothHands(i) ? 'both' : SLOT_HANDS[i.slot ?? -1])

const loadedOf = (i: LubecItem): Pick<LubecHeld, 'loaded'> =>
  (i.mode === 'firearm' ? { loaded: { now: i.loaded ?? 0, capacity: i.capacity ?? 0 } } : {})

const heldOf = (i: LubecItem, hands: LubecHands): LubecHeld =>
  ({ itemId: i.id, name: i.name, hands, weapon: i.kind === 'weapon', ...loadedOf(i) })

const HAND_ORDER: Readonly<Record<LubecHands, number>> = { both: 0, left: 1, right: 2 }

/** What the hands hold, left hand first. A thing in hand with no readable slot holds neither hand, as `handsTaken` reads it. */
export function lubecHeld(gear: LubecGear): LubecHeld[] {
  return itemsIn(gear, 'hands')
    .flatMap((i) => { const hands = handsOf(i); return hands ? [heldOf(i, hands)] : [] })
    .sort((a, b) => HAND_ORDER[a.hands] - HAND_ORDER[b.hands])
}

/** How many hands are free: 2, 1 or 0. */
export const lubecFreeHands = (gear: LubecGear): number => 2 - handsTaken(gear).size

/** Fisticuffs needs a free hand. */
export const lubecFisticuffsOffered = (gear: LubecGear): boolean => lubecFreeHands(gear) >= 1

/** The hands Fisticuffs fights with: both while both are free, else the free one; null with both hands full. */
export function lubecFisticuffsHands(gear: LubecGear): LubecHands | null {
  const taken = handsTaken(gear)
  if (taken.size === 0) return 'both'
  return taken.size === 1 ? SLOT_HANDS[taken.has(0) ? 1 : 0] : null
}

/** Both hands are full and neither holds a weapon: there is nothing to fight with until something is dropped. */
export const lubecHandsFullOfThings = (gear: LubecGear): boolean =>
  !lubecFisticuffsOffered(gear) && lubecHeld(gear).every((h) => !h.weapon)
