import type { LubecWoundCardSpec, LubecWoundConcussion, LubecWoundOutcome } from './outcome'

// The two concussions as `terms.md` defines them; a row names one and the
// terms say what its Body Save's success and failure do.
//
// Minor Concussion. Success: Dazed only, 0 Trauma instead of +1. Failure: Dazed and -10 Handle until 1 Long Rest.
// Severe Concussion. Success: a Minor Concussion instead (Dazed and -10 Handle until 1 Long Rest), +1 Trauma instead
// of +2, no lasting effect. Failure: Dazed and -30 Handle; after 1 Long Rest -10 Handle; after 2 Long Rests the
// penalty clears, leaving Persistent concussion, lasting -10 Intellect.

const DAZED = { kind: 'dazed', turns: 1 } as const

const minorHandle = (): LubecWoundCardSpec => ({ key: 'concussion', part: 'Concussion', steps: [{ until: 'long-rest', modifiers: [{ target: 'Handle', amount: -10 }] }] })

/** What the concussion's Body Save gives, by its result. */
export function lubecConcussionOutcome(concussion: LubecWoundConcussion, success: boolean): LubecWoundOutcome {
  if (concussion.kind === 'minor') return success ? { now: [DAZED], cards: [] } : { now: [DAZED], cards: [minorHandle()] }
  if (success) return { now: [DAZED], cards: [minorHandle()] }
  const lasting = concussion.noLasting ? [] : [{ until: 'lasting' as const, modifiers: [{ target: 'Intellect' as const, amount: -10 }], labels: ['Persistent concussion'] }]
  return {
    now: [DAZED],
    cards: [{
      key: 'concussion', part: 'Concussion',
      steps: [
        { until: 'long-rest', modifiers: [{ target: 'Handle', amount: -30 }] },
        { until: 'long-rest', modifiers: [{ target: 'Handle', amount: -10 }] },
        ...lasting,
      ],
    }],
  }
}

/** How much a passed concussion Save takes off the row's Trauma: one, unless the row keeps its Trauma regardless. */
export const lubecConcussionTraumaRelief = (concussion: LubecWoundConcussion, success: boolean): number =>
  (success && !concussion.keepTrauma ? 1 : 0)
