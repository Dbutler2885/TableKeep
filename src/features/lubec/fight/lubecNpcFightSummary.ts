// What a player may see of an NPC they attack (spec question 3's default): the
// armor on each body part and the wound level, kept on the NPC's story record,
// which a player may read, because the sheet behind it is the GM's alone.

import type { LubecCharacterSheet } from '../../ruleSets/lubec/characterRecord'
import { lubecArmorAt } from '../../ruleSets/lubec/gear/armorAt'
import type { LubecGear, LubecWoundKind } from '../../ruleSets/lubec/gear/gearRecord'
import { LOC_KEYS } from '../../ruleSets/lubec/gear/gearRules'
import { lubecWoundLevel } from '../../ruleSets/lubec/woundLevel'
import { WOUND_KINDS } from '../gear/itemLabels'

export type LubecArmorNumbers = Readonly<Record<LubecWoundKind, number>>

/** Body parts that stop the same amount, and how much. */
export type LubecArmorZone = { locs: string[]; armor: LubecArmorNumbers }

export type LubecNpcFightSummary = { armor: LubecArmorZone[]; woundLevel: string | null }

const armorOn = (gear: LubecGear, loc: string) =>
  Object.fromEntries(WOUND_KINDS.map((w) => [w, lubecArmorAt(gear, loc, w)])) as LubecArmorNumbers

const isBare = (armor: LubecArmorNumbers) => WOUND_KINDS.every((w) => armor[w] === 0)

function zonesOf(gear: LubecGear): LubecArmorZone[] {
  const zones = new Map<string, LubecArmorZone>()
  for (const loc of LOC_KEYS) {
    const armor = armorOn(gear, loc)
    if (isBare(armor)) continue
    const key = WOUND_KINDS.map((w) => armor[w]).join()
    const zone = zones.get(key)
    if (zone) zone.locs.push(loc)
    else zones.set(key, { locs: [loc], armor })
  }
  return [...zones.values()]
}

/** The public summary of a sheet, with nothing else from it; a missing sheet has no armor to show. */
export const lubecNpcFightSummary = (sheet: LubecCharacterSheet | null): LubecNpcFightSummary => ({
  armor: sheet ? zonesOf(sheet.gear) : [],
  woundLevel: lubecWoundLevel(sheet),
})

const isZone = (z: Partial<LubecArmorZone> | null): z is LubecArmorZone =>
  Array.isArray(z?.locs) && WOUND_KINDS.every((w) => typeof z?.armor?.[w] === 'number')

/** A summary as stored; null for an NPC that has none. */
export function readLubecNpcFightSummary(stored: unknown): LubecNpcFightSummary | null {
  const summary = stored as Partial<LubecNpcFightSummary> | null | undefined
  if (!Array.isArray(summary?.armor) || !summary.armor.every(isZone)) return null
  return { armor: summary.armor, woundLevel: typeof summary.woundLevel === 'string' ? summary.woundLevel : null }
}
