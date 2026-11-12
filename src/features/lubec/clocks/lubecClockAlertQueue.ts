import { mergeLubecClockChange, type LubecClockChange } from './lubecClock'

/** A change waiting to be announced; `seq` is new whenever the popup should start over. */
export type LubecClockAlert = LubecClockChange & { seq: number }

const changes = (change: LubecClockChange) => change.added.length + change.removed.length

/**
 * The queue after more changes come in: a clock already waiting is updated in
 * place, measured from what the table last saw, and dropped if it has come
 * back to that; the one on screen starts over so the latest change is the one
 * animated. Any other clock joins the end.
 */
export function enqueueLubecClockAlerts(queue: readonly LubecClockAlert[], incoming: readonly LubecClockChange[], nextSeq: () => number): LubecClockAlert[] {
  return incoming.reduce<LubecClockAlert[]>((waiting, change) => {
    const at = waiting.findIndex((alert) => alert.clock.id === change.clock.id)
    if (at < 0) return [...waiting, { ...change, seq: nextSeq() }]
    const merged = mergeLubecClockChange(waiting[at], change)
    if (changes(merged) === 0) return waiting.filter((_, index) => index !== at)
    return waiting.map((alert, index) => (index === at ? { ...merged, seq: index === 0 ? nextSeq() : alert.seq } : alert))
  }, [...queue])
}
