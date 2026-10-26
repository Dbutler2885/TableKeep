// Armor layers (Rules A1 and A3), copied from the inventory prototype (B).
// Each is pure: gear in, result out. The placement rule asks `layerProblem`
// before it lets armor be worn.

import type { LubecGear, LubecItem } from './gearRecord'
import { baseLoc, LOC_KEYS, locName, RULES } from './gearRules'

/** Armor as the layer rule reads it: an item, or the add form's draft of one. */
export type LubecArmorPiece = Pick<LubecItem, 'name'> & Partial<Pick<LubecItem, 'locs' | 'exclusive'>>

/** The worn pieces that cover the location `key`, less the one being moved. */
export function wornOn(gear: LubecGear, key: string, ignoreId?: string | null): LubecItem[] {
  return gear.items.filter((i) => i.carrier === 'worn' && i.id !== ignoreId && (i.locs ?? []).includes(key))
}

// Rule A1: ordinary armor takes one layer, exclusive armor takes every layer where it covers.
export function layersUsed(gear: LubecGear, key: string, ignoreId?: string | null): number {
  const lim = RULES.layers[baseLoc(key)]
  return Math.min(lim, wornOn(gear, key, ignoreId).reduce((n, a) => n + (a.exclusive ? lim : 1), 0))
}

const layerRefusal = (gear: LubecGear, a: LubecArmorPiece, k: string, ignoreId?: string | null): string => {
  const lim = RULES.layers[baseLoc(k)]
  const who = wornOn(gear, k, ignoreId).map((i) => i.name).join(', ')
  return a.exclusive
    ? `${a.name} is exclusive and needs the ${locName(k).toLowerCase()} bare, but ${who} is there. Take it off first.`
    : `No free layer on the ${locName(k).toLowerCase()}: ${layersUsed(gear, k, ignoreId)} of ${lim} taken by ${who}. Take something off first.`
}

/** Rule A3: why armor `a` cannot be put on, or null when every part it covers has room. A base rule: no override. */
export function layerProblem(gear: LubecGear, a: LubecArmorPiece, ignoreId?: string | null): string | null {
  for (const k of a.locs ?? []) {
    const lim = RULES.layers[baseLoc(k)]
    if (layersUsed(gear, k, ignoreId) + (a.exclusive ? lim : 1) > lim) return layerRefusal(gear, a, k, ignoreId)
  }
  return null
}

/** The parts in `locs`, in body order, that have no free layer left: the armor maker's "Already full". */
export function lubecFullParts(gear: LubecGear, locs: readonly string[], ignoreId?: string | null): string[] {
  return LOC_KEYS.filter((k) => locs.includes(k) && layersUsed(gear, k, ignoreId) >= RULES.layers[baseLoc(k)])
}
