import type { LubecEffect, LubecRestriction } from './effects'
import { lubecRestrictionSources } from './activeRestrictions'

// Which hands a character can use, read from the active cards' current steps:
// an unusable arm or a hand that cannot grip takes that hand out even when it
// is empty, and "two-handed actions impossible" takes out anything needing
// both. Gear placement, weapon choices, catches, pickups and reloading all ask
// this one reader. A numeric Handle penalty never makes a hand unusable; a
// later step, and a card converted when a fight ended, never count.

/** A hand out of use: its slot (0 the left, 1 the right) and the card that says so. */
export type LubecHandLimit = { slot: 0 | 1; why: string }

export type LubecHandLimits = { unusable: readonly LubecHandLimit[]; noTwoHanded: string | null }

/** Both hands usable, nothing forbidden. */
export const LUBEC_FREE_HANDS: LubecHandLimits = { unusable: [], noTwoHanded: null }

const SLOTS = { L: 0, R: 1 } as const

const takesHand = (restriction: LubecRestriction): restriction is Extract<LubecRestriction, { side: string }> =>
  restriction.kind === 'arm-unusable' || restriction.kind === 'no-grip'

/** The hand limits the cards set, from each card's current step only. */
export function lubecHandLimits(effects: readonly LubecEffect[]): LubecHandLimits {
  const sources = lubecRestrictionSources(effects)
  const unusable = new Map<0 | 1, LubecHandLimit>()
  for (const { restriction, why } of sources) {
    if (!takesHand(restriction)) continue
    const slot = SLOTS[restriction.side]
    if (!unusable.has(slot)) unusable.set(slot, { slot, why })
  }
  const noTwoHanded = sources.find(({ restriction }) => restriction.kind === 'no-two-handed')?.why ?? null
  return { unusable: [...unusable.values()].sort((a, b) => a.slot - b.slot), noTwoHanded }
}

/** Why a hand cannot be used, or null when it can. */
export const lubecHandUnusable = (hands: LubecHandLimits, slot: number): string | null =>
  hands.unusable.find((limit) => limit.slot === slot)?.why ?? null

/** Why a thing needing both hands cannot be held or used: two-handed actions are impossible, or either hand is out. */
export const lubecBothHandsRefusal = (hands: LubecHandLimits): string | null =>
  hands.noTwoHanded ?? hands.unusable[0]?.why ?? null
