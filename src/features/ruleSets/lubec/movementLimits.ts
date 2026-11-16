import { lubecRestrictionWords, lubecStepRestrictions, type LubecEffect } from './effects'

// Which Movement choices the active cards forbid, read from each card's
// current step: "cannot run" takes Run, "no Evasive Movement" takes Evasive,
// and "crawl only without help" takes both. Moving or staying is always left;
// helping, carrying and distances are the table's to narrate. A card's words
// are never scanned, and Speed at Disadvantage is a roll mode, not a block.

/** Why each choice is forbidden, naming the card; null when it is not. */
export type LubecMovementLimits = { run: string | null; evade: string | null }

export const LUBEC_FREE_MOVEMENT: LubecMovementLimits = { run: null, evade: null }

const cardName = (effect: LubecEffect) => (typeof effect.part === 'string' && effect.part && effect.part !== effect.name ? `${effect.name}, ${effect.part}` : effect.name)

/** The Movement choices the cards' current steps forbid; a later step and a card converted when a fight ended never count. */
export function lubecMovementLimits(effects: readonly LubecEffect[]): LubecMovementLimits {
  let run: string | null = null
  let evade: string | null = null
  for (const effect of effects) {
    if (effect.afterCombat !== undefined || !effect.steps[0]) continue
    for (const restriction of lubecStepRestrictions(effect.steps[0])) {
      const why = `${lubecRestrictionWords(restriction)} (${cardName(effect)})`
      if (restriction.kind === 'no-run' || restriction.kind === 'crawl-only') run ??= why
      if (restriction.kind === 'no-evasive' || restriction.kind === 'crawl-only') evade ??= why
    }
  }
  return { run, evade }
}
