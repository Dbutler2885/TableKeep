// The GM's explicit Comatose or Dead condition on a Lubec sheet. Only the GM
// sets, changes or clears it, and nothing in the app does: no Death Save
// reminder, threshold, card or countdown. While set, a combatant's unresolved
// stages are skipped; nothing rolled is undone, nobody is deleted or taken
// Out, and every wound consequence still lands.

export const LUBEC_CONDITIONS = ['comatose', 'dead'] as const
export type LubecCondition = typeof LUBEC_CONDITIONS[number]

export const LUBEC_CONDITION_NAMES: Readonly<Record<LubecCondition, string>> = { comatose: 'Comatose', dead: 'Dead' }

/** A stored condition as the sheet reads it; anything else is none. */
export const parseLubecCondition = (raw: unknown): LubecCondition | undefined =>
  (LUBEC_CONDITIONS as readonly unknown[]).includes(raw) ? raw as LubecCondition : undefined
