// Hidden carriers (spec 4.4). B hid one by drawing less; here the carrier and
// its items live only in a record under the character that its owner and the
// GM alone can read, and nothing about it reaches the character's document.

import type { LubecCarrierRecord } from './gearRecord'

export type LubecHiddenCarrier = LubecCarrierRecord

/** The hidden carrier a place is in ("stash", "stash#1"), or null for a place on another record. */
export const lubecHiddenAt = (hidden: readonly LubecHiddenCarrier[], place: string): LubecHiddenCarrier | null =>
  hidden.find((c) => c.id === place.split('#')[0]) ?? null
