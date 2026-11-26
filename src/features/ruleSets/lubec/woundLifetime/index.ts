// A Lubec wound's lifetime, from landing to the fight's close: the one owner
// of what its round metadata means. Landing works out the rounds a wound takes
// once, for its cards and the fight alike; the end of each round says whose
// sheet to tick and which countdowns fall due; a sheet tick or closing turns
// the stored cards into conditional changes; and every reader asks here what
// ends a card and whether a fight's round reads it.
//
// Everything here is pure: no sheet is fetched, no write is chosen, and no die
// is rolled. The fight applies stage losses and queues ticks, and delivery
// turns card changes into revision-checked sheet edits. Cards stay stored in
// their existing fields, read in place, so older cards keep working.

export { landWoundLifetime } from './landing'
export { endWoundRound } from './schedule'
export { closeWoundLifetimes, tickWoundLifetimes } from './sheet'
export { readWoundLifetime } from './view'
export type {
  CardChange, CardView, DueCard, EndRoundInput, EndRoundPlan, Existing, LandingInput, LandingPlan, Lost,
  PublicCountdown, PublicLanding, RoundContext, SheetLifetimeInput, SheetLifetimePlan, TimerKind, ViewInput,
} from './types'
