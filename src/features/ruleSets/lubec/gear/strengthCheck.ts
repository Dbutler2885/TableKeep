// The Strength check for a heavy thing (Rule E5, spec 5.5), from the
// inventory prototype's `strengthPrompt` and its call sites (B). B asked the
// table to roll and the player to press Passed or Failed; here the Core roller
// rolls it as an ordinary Strength check, so a failure adds the roller's own
// Stress, and the roll is recorded as the character's last roll. These are the
// rule's pure parts: when it asks, what it rolls under, and what it records.

import type { LubecCharacterSheet } from '../characterRecord'
import { lubecCheckTarget, lubecFailedCheckStress } from '../checkRoll'
import type { LubecGear, LubecItem } from './gearRecord'
import { lubecWithItems } from './moves'
import { onYou } from './placement'

/** A recorded Strength roll: passed or failed. */
export type LubecCheck = NonNullable<LubecItem['check']>

/** What the check rolls under: current Strength with effects and no armed skill, or null while Strength is a hole. */
export const lubecStrengthTarget = (sheet: LubecCharacterSheet): number | null => lubecCheckTarget(sheet, 'Strength', null)

/** The Stress a failure adds: an ordinary failed Strength check's, 2 for an Overachiever. */
export const lubecStrengthStress = (sheet: LubecCharacterSheet): number => lubecFailedCheckStress(sheet)

// "backpack#0", "hands", "body#1", "worn" or a carrier's id, as the place it names.
const carrierOfDest = (dest: string): string => dest.split('#')[0]

/**
 * Rule E5: whether a heavy or extra heavy thing coming to `dest` asks for a
 * Strength roll. `was` is the thing as it stands, moved or edited, or null for
 * a new one: a thing already on you asks again only when its weight changed.
 */
export function lubecNeedsStrength(item: Pick<LubecItem, 'weight'>, dest: string, was: Pick<LubecItem, 'carrier' | 'weight'> | null): boolean {
  if (item.weight === 'normal' || !onYou({ carrier: carrierOfDest(dest) })) return false
  return !was || !onYou(was) || was.weight !== item.weight
}

/** What a roll records on the thing: passed or failed, or null for an extra heavy thing that failed, which can't be carried. */
export const lubecCheckOf = (item: Pick<LubecItem, 'weight'>, outcome: 'success' | 'failure'): LubecCheck | null => {
  if (outcome === 'success') return 'pass'
  return item.weight === 'extra' ? null : 'fail'
}

/** Heavy and extra heavy things on you with no recorded roll: they came without the prompt, from the GM or a transfer. */
export const lubecStrengthPending = (gear: LubecGear): LubecItem[] =>
  gear.items.filter((i) => i.weight !== 'normal' && onYou(i) && !i.check)

/** The gear with `itemId`'s recorded roll set to `check`: the card's switch, which never touches Stress. */
export function lubecWithCheck(gear: LubecGear, itemId: string, check: LubecCheck): LubecGear {
  const item = gear.items.find((x) => x.id === itemId)
  return item ? lubecWithItems(gear, { ...item, check }) : gear
}
