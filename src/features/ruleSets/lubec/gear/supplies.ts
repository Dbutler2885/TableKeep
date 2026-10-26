// Supplies (Rule L1), copied from the inventory prototype (B): what a gun or
// a holder takes, matched by id, never by spelling. `loose` is [size, how
// many fit in one slot] for a loose stack of it (Rule L2): rounds are small
// when loose, and water and lamp oil can't be loose at all.

import type { LubecGear, LubecItem, LubecSupply } from './gearRecord'
import { isBox } from './gearRules'
import { onYou } from './placement'

/** The game's supplies, in the game's rules settings. */
export const LUBEC_SUPPLIES: readonly LubecSupply[] = [
  { id: 'a22', name: '.22 rounds' },
  { id: 'a38', name: '.38 rounds' },
  { id: 'a12g', name: '12-gauge shells' },
  { id: 'a3006', name: '.30-06 rounds' },
  { id: 'arrow', name: 'Arrows' },
  { id: 'shot', name: 'Slingshot shot' },
  { id: 'bb', name: 'BBs' },
  { id: 'dcell', name: 'D batteries', loose: [1, 4] },
  { id: 'water', name: 'Water', loose: null },
  { id: 'oil', name: 'Lamp oil', loose: null },
]

/** Every supply this character's gear can name: the game's, then any a player made. */
export const lubecSupplies = (gear: Pick<LubecGear, 'supplies'>): LubecSupply[] => [...LUBEC_SUPPLIES, ...gear.supplies]

/** A supply's loose shape (Rule L2): [size, per slot], null when it can't be loose, and [0, 1] for one the list doesn't know. */
export function lubecLooseOf(supplies: readonly LubecSupply[], sid: string | undefined): LubecSupply['loose'] {
  const t = supplies.find((a) => a.id === sid)
  return t && 'loose' in t ? t.loose : [0, 1]
}

// A supply is loose (a consumable) or in a box (Rule L2). These read either one the same way.
/** The supply an item is a store of: a loose stack's, or a box's. */
export const lubecSupplyIn = (i: LubecItem): string | undefined => (i.kind === 'consumable' ? i.fits : isBox(i) ? i.takes : undefined)
/** How much of its supply an item holds. */
export const lubecAmountIn = (i: LubecItem): number => (i.kind === 'consumable' ? i.qty : i.loaded ?? 0)

/** Everything of `w`'s supply on you, loose or boxed, but not what's already in `w`. */
export const lubecAmmoOnYou = (gear: LubecGear, w: LubecItem): number =>
  gear.items.filter((i) => i.id !== w.id && onYou(i) && lubecSupplyIn(i) === w.takes).reduce((n, i) => n + lubecAmountIn(i), 0)
