import type { LubecCounters } from './characterRecord'

// The Core page's counters, changed one step at a time by hand. The buttons
// are the manual override: Stress has no maximum, and Minimum Stress is a floor
// for recovery only, never for the buttons. No counter goes below 0.

export type LubecCounterName = keyof LubecCounters

export const LUBEC_COUNTERS: readonly (readonly [LubecCounterName, string])[] = [
  ['stress', 'Stress'],
  ['minimumStress', 'Minimum Stress'],
  ['trauma', 'Trauma'],
]

/** The counters after one press of plus or minus, or null when minus would take that counter below 0. */
export function stepLubecCounter(counters: LubecCounters, name: LubecCounterName, step: 1 | -1): LubecCounters | null {
  const next = counters[name] + step
  return next < 0 ? null : { ...counters, [name]: next }
}

/**
 * Stress after a recovery or a Panic row lowers it: never below Minimum Stress,
 * and never raised when the buttons have already taken it lower than that.
 */
export const lubecStressLoweredBy = (counters: LubecCounters, by: number): number =>
  Math.min(counters.stress, Math.max(counters.minimumStress, counters.stress - by))
