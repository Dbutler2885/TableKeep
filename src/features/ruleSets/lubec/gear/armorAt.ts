// Armor on one part (Rule A2), copied from the inventory prototype (B's
// armorOn). Pure: gear in, a number out. The Armor panel's readout and the
// fight modal read it; nothing stores it.

import { wornOn } from './armorLayers'
import type { LubecGear, LubecWoundKind } from './gearRecord'

/**
 * Rule A2: how much worn armor covers the location `key` against a kind of wound.
 * The worn pieces' numbers add up, and come off Impact for that kind of wound; a part with none reads 0.
 */
export function lubecArmorAt(gear: LubecGear, key: string, wound: LubecWoundKind): number {
  return wornOn(gear, key).reduce((n, a) => n + (a.armor?.[wound] ?? 0), 0)
}
