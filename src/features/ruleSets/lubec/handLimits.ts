import { lubecRestrictionWords, lubecStepRestrictions, type LubecEffect } from './effects'

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

const cardName = (effect: LubecEffect) => (typeof effect.part === 'string' && effect.part && effect.part !== effect.name ? `${effect.name}, ${effect.part}` : effect.name)

/** The hand limits the cards set, from each card's current step only. */
export function lubecHandLimits(effects: readonly LubecEffect[]): LubecHandLimits {
  const unusable: LubecHandLimit[] = []
  let noTwoHanded: string | null = null
  for (const effect of effects) {
    if (effect.afterCombat !== undefined || !effect.steps[0]) continue
    for (const restriction of lubecStepRestrictions(effect.steps[0])) {
      const why = `${lubecRestrictionWords(restriction)} (${cardName(effect)})`
      if (restriction.kind === 'arm-unusable' || restriction.kind === 'no-grip') {
        const slot = SLOTS[restriction.side]
        if (!unusable.some((limit) => limit.slot === slot)) unusable.push({ slot, why })
      }
      if (restriction.kind === 'no-two-handed') noTwoHanded ??= why
    }
  }
  return { unusable: unusable.sort((a, b) => a.slot - b.slot), noTwoHanded }
}

/** Why a hand cannot be used, or null when it can. */
export const lubecHandUnusable = (hands: LubecHandLimits, slot: number): string | null =>
  hands.unusable.find((limit) => limit.slot === slot)?.why ?? null

/** Why a thing needing both hands cannot be held or used: two-handed actions are impossible, or either hand is out. */
export const lubecBothHandsRefusal = (hands: LubecHandLimits): string | null =>
  hands.noTwoHanded ?? hands.unusable[0]?.why ?? null
