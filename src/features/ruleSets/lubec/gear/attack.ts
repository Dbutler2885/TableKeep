// Attack and Fire, copied from the inventory prototype (B's attack, rules K2
// and K6): a weapon in hand attacks, and a firearm uses one round to do it.
// Gear rolls no die and logs nothing; the fight modal calls the same function
// at its Result step (spec 5.6). Pure: gear in, the next gear out.

import type { LubecGear, LubecItem } from './gearRecord'

/** Why a weapon cannot attack: it has left the sheet, it is not in hand, or a firearm has no round loaded. */
export type LubecAttackRefusal = 'gone' | 'not-in-hand' | 'empty'

/** The gear after the attack, and the weapon as it is now; or why it cannot attack. */
export type LubecSpendRound = { ok: true; gear: LubecGear; weapon: LubecItem } | { ok: false; why: LubecAttackRefusal }

const withItem = (gear: LubecGear, next: LubecItem): LubecGear => ({ ...gear, items: gear.items.map((x) => (x.id === next.id ? next : x)) })

// A firearm uses one round; with none loaded it stops, and the empty-weapon prompt asks what to do.
function fire(gear: LubecGear, w: LubecItem): LubecSpendRound {
  if (!w.loaded) return { ok: false, why: 'empty' }
  const weapon = { ...w, loaded: w.loaded - 1 }
  return { ok: true, gear: withItem(gear, weapon), weapon }
}

/** Attack or Fire with the weapon `itemId`, in hand: a firearm uses one round, a melee or thrown weapon uses none. */
export function lubecSpendRound(gear: LubecGear, itemId: string): LubecSpendRound {
  const w = gear.items.find((x) => x.id === itemId && x.kind === 'weapon')
  if (!w) return { ok: false, why: 'gone' }
  if (w.carrier !== 'hands') return { ok: false, why: 'not-in-hand' }
  return w.mode === 'firearm' ? fire(gear, w) : { ok: true, gear, weapon: w }
}
