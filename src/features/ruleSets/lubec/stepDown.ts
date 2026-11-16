import type { LubecCounters } from './characterRecord'
import { stepDownLubecEffect, type LubecEffect } from './effects'

// Step down on a card: its current step ends and the next one begins. A step
// down never repeats the hit, a drop, a knockdown, Dazed, a Save, Stress or
// Trauma; the one thing reaching a step can add is the Minimum Stress that
// step names ("after 2 Long Rests: lasting +4 minimum Stress"), added once,
// as the step begins.

export type LubecSteppable = { effects: readonly LubecEffect[]; counters: LubecCounters }

/** The Minimum Stress a step adds as it begins; 0 for every step that names none. */
const minimumStressOf = (effect: LubecEffect | undefined): number => {
  const amount = effect?.steps[1]?.minimumStress
  return Number.isInteger(amount) && (amount as number) > 0 ? amount as number : 0
}

/** The card stepped down, and the counters with any Minimum Stress the step it reaches adds. */
export function stepDownLubecSheet({ effects, counters }: LubecSteppable, id: string): { effects: LubecEffect[]; counters: LubecCounters } {
  const added = minimumStressOf(effects.find((effect) => effect.id === id))
  const next = stepDownLubecEffect(effects, id)
  return { effects: next, counters: added ? { ...counters, minimumStress: counters.minimumStress + added } : counters }
}
