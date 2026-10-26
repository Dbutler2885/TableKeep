import type { LubecCharacterSheet } from './characterRecord'
import type { LubecModifier } from './derivations'
import { lubecActiveModifiers } from './effects'
import { lubecItemsNeedingAPlace, type LubecGear, type LubecItem } from './gear/gearRecord'
import { RULES } from './gear/gearRules'
import { inventoryFull, onYou } from './gear/placement'

// The one place a Lubec value learns what changes it: the stored effects'
// modifiers, then gear's Speed losses (spec 5.3). Gear owns the losses and Core
// applies them; each is worked out from the stored gear when read, never
// stored, and the player may switch any of them off by its key.

/** One of gear's Speed losses (Rules E1 to E4, B's `speedMods`): a stable key, and the reason the Effects panel shows. */
export type LubecGearModifier = LubecModifier & { source: 'gear'; key: string; reason: string }

const speedLoss = (key: string, loss: number, reason: string): LubecGearModifier =>
  ({ target: 'Speed', amount: -loss, source: 'gear', key, reason })

type ItemLossRule = { key: string; applies: (i: LubecItem) => boolean; loss: number; why: string }

// Rules E1 to E3: what a thing on you costs, by its weight, its recorded Strength roll and its size.
const ITEM_LOSS_RULES: readonly ItemLossRule[] = [
  { key: 'heavy', applies: (i) => i.weight === 'heavy' && i.check === 'fail', loss: RULES.heavyFail, why: 'heavy, Strength failed' },
  { key: 'extra', applies: (i) => i.weight === 'extra' && i.check === 'pass', loss: RULES.extraPass, why: 'extra heavy, always' },
  { key: 'huge', applies: (i) => i.size === 8, loss: RULES.encumbering, why: '8 slots, encumbering' },
]

const itemLosses = (i: LubecItem): LubecGearModifier[] =>
  ITEM_LOSS_RULES.filter((rule) => rule.applies(i)).map((rule) => speedLoss(`${rule.key}:${i.id}`, rule.loss, `${i.name}: ${rule.why}`))

/**
 * Every Speed loss gear causes now, switched off or not. Only things on you
 * count (Rules C3 and E7), and a thing whose place cannot be read counts for
 * nothing. A heavy thing with no recorded roll costs nothing yet. Rule E4: a
 * full inventory is a flat loss of its own.
 */
export function lubecGearModifiers(gear: LubecGear): LubecGearModifier[] {
  const unplaced = new Set(lubecItemsNeedingAPlace(gear).map((i) => i.id))
  const losses = gear.items.filter((i) => onYou(i) && !unplaced.has(i.id)).flatMap(itemLosses)
  return inventoryFull(gear) ? [...losses, speedLoss('full', RULES.fullInventory, 'Full inventory')] : losses
}

/** Whether the player switched this loss off. */
export const isLubecGearLossOff = (gear: LubecGear, loss: LubecGearModifier): boolean => gear.overrides.includes(loss.key)

/** The modifiers that count now: the stored effects' first, then gear's Speed losses, less any the player switched off. */
export const lubecSheetModifiers = (sheet: Pick<LubecCharacterSheet, 'effects' | 'gear'>): LubecModifier[] => [
  ...lubecActiveModifiers(sheet.effects),
  ...lubecGearModifiers(sheet.gear).filter((loss) => !isLubecGearLossOff(sheet.gear, loss)),
]

/**
 * The gear with every switched-off key that names no loss now taken out: the
 * thing left you, its roll was cleared, or the inventory stopped being full.
 * Without that, a stale switch would quietly cancel a new loss the next time
 * the thing comes back. Every gear write goes through it.
 */
export function lubecPrunedOverrides(gear: LubecGear): LubecGear {
  const live = new Set(lubecGearModifiers(gear).map((loss) => loss.key))
  const overrides = gear.overrides.filter((key) => live.has(key))
  return overrides.length === gear.overrides.length ? gear : { ...gear, overrides }
}

/** The gear with the loss of this key switched on (counting) or off. */
export function lubecSwitchGearLoss(gear: LubecGear, key: string, on: boolean): LubecGear {
  const rest = gear.overrides.filter((k) => k !== key)
  return { ...gear, overrides: on ? rest : [...rest, key] }
}
