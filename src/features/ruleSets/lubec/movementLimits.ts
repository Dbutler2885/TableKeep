import type { LubecEffect } from './effects'
import { lubecRestrictionSources } from './activeRestrictions'

// Which Movement choices the active cards forbid, read from each card's
// current step: "cannot run" takes Run, "no Evasive Movement" takes Evasive,
// and "crawl only without help" takes both. Moving or staying is always left;
// helping, carrying and distances are the table's to narrate. A card's words
// are never scanned, and Speed at Disadvantage is a roll mode, not a block.

/** Why each choice is forbidden, naming the card; null when it is not. */
export type LubecMovementLimits = { run: string | null; evade: string | null }

export const LUBEC_FREE_MOVEMENT: LubecMovementLimits = { run: null, evade: null }

/** The Movement choices the cards' current steps forbid; a later step and a card converted when a fight ended never count. */
export function lubecMovementLimits(effects: readonly LubecEffect[]): LubecMovementLimits {
  const sources = lubecRestrictionSources(effects)
  const blocks = (kinds: readonly string[]) => sources.find(({ restriction }) => kinds.includes(restriction.kind))?.why ?? null
  return { run: blocks(['no-run', 'crawl-only']), evade: blocks(['no-evasive', 'crawl-only']) }
}
