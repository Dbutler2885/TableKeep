import { briefWindowEnd, countdownDue, fromFight, isRecord, landedRound, storedCard, type StoredCard, type StoredTimer } from './stored'
import type { CardChange, DueCard, Lost, SheetLifetimeInput, SheetLifetimePlan } from './types'

// A fight's rounds on the sheet's own stored cards, read as delivery found
// them. Every change carries the exact value it read, so a concurrent manual
// edit is never overwritten; the delivery receipt, not this module, makes a
// retry return the first outcome instead of ending a step twice.

type Fields = Readonly<Record<string, unknown>>
type Card = { effect: Fields; stored: StoredCard }

/** The stored cards a change can name: records with a stored id. A card without one is only ever read. */
const cardsOf = (effects: unknown): Card[] =>
  (Array.isArray(effects) ? effects.filter(isRecord) : [])
    .filter((effect) => typeof effect.id === 'string')
    .map((effect) => ({ effect, stored: storedCard(effect) }))

const idOf = (effect: Fields) => String(effect.id)

/** Ending a card's current step: the next step begins, or the card goes when it was the last. */
function stepDown(effect: Fields): CardChange {
  const steps = effect.steps as unknown[]
  if (steps.length > 1) return { kind: 'set', id: idOf(effect), field: 'steps', before: { exists: true, value: steps }, value: steps.slice(1) }
  return { kind: 'remove', id: idOf(effect), before: effect }
}

/** A brief window from this fight whose round has ended by the end of `round`. */
function windowEnded({ stored }: Card, fightId: string, round: number): boolean {
  return fromFight(stored, fightId) && stored.step?.until === 'next-round-end' && briefWindowEnd(landedRound(stored)) <= round
}

/** Lost stages from this fight that have all passed by the end of `round`. */
function stagesPassed({ stored }: Card, fightId: string, round: number): boolean {
  if (!stored.lost || !fromFight(stored, fightId) || stored.converted) return false
  return Math.max(...stored.lost.movement, ...stored.lost.action) <= round
}

/** A countdown from this fight that falls due by the end of `round` and has not fired. */
function countdownIsDue({ stored }: Card, fightId: string, round: number): boolean {
  return fromFight(stored, fightId) && stored.timer !== null && !stored.timer.fired && countdownDue(landedRound(stored), stored.timer.rounds) <= round
}

const FIRED_WORDS = {
  bleed: (round: number) => `+1 Trauma added at the end of round ${round}`,
  critical: (round: number) => `Death Save due at the end of round ${round}`,
} as const

/** A countdown firing: it is marked fired, with the round, and its card says what happened, in the same write. */
function fired({ effect, stored }: Card, round: number): CardChange[] {
  const countdown = stored.countdown!
  const { kind } = stored.timer as StoredTimer
  return [
    { kind: 'set', id: idOf(effect), field: 'countdown', before: { exists: true, value: countdown }, value: { ...countdown, fired: true, firedRound: round } },
    { kind: 'set', id: idOf(effect), field: 'steps', before: { exists: true, value: effect.steps }, value: [{ modifiers: [], labels: [FIRED_WORDS[kind](round)], until: 'by-hand' }] },
  ]
}

const dueCard = ({ effect }: Card): DueCard => ({ id: idOf(effect), name: String(effect.name ?? 'A wound') })

const timerKind = (card: Card) => (card.stored.timer as StoredTimer).kind

/**
 * The end of one round for one combatant's sheet: windows that end and stage losses that have all passed step down,
 * and countdowns falling due fire; each due bleed adds +1 Trauma. Earlier countdowns caught up on, never twice.
 */
export function tickWoundLifetimes({ effects, fightId, round }: SheetLifetimeInput): SheetLifetimePlan {
  const cards = cardsOf(effects)
  const ended = cards.filter((card) => windowEnded(card, fightId, round) || stagesPassed(card, fightId, round)).map((card) => stepDown(card.effect))
  const due = cards.filter((card) => countdownIsDue(card, fightId, round))
  const bleeding = due.filter((card) => timerKind(card) === 'bleed')
  return {
    changes: [...ended, ...due.flatMap((card) => fired(card, round))],
    traumaDelta: bleeding.length,
    bleeding: bleeding.map(dueCard),
    critical: due.filter((card) => timerKind(card) === 'critical').map(dueCard),
  }
}

// Ending a fight, for one combatant: rest-of-combat steps end, and a round
// window or countdown still running becomes an after-combat card that suggests
// the rounds left as minutes, for the table to resolve by hand. No later fight
// reads such a card. Long Rest, treatment, minute and lasting cards are left
// alone, and nothing is healed or applied.

const AFTER_WORDS = {
  window: '',
  bleed: '+1 Trauma when it runs out',
  critical: 'Death Save when it runs out',
} as const

const minutes = (count: number) => `About ${count} minute${count === 1 ? '' : 's'} left`

/** The rounds still to run, the round End is pressed in counting as one, never fewer than one. */
const remaining = (lastRound: number, closeRound: number) => Math.max(1, lastRound - closeRound + 1)

function afterCombat(effect: Fields, count: number, instruction: string, extra: Fields = {}): CardChange[] {
  return [
    { kind: 'set', id: idOf(effect), field: 'steps', before: { exists: true, value: effect.steps }, value: [{ modifiers: [], labels: [minutes(count), instruction].filter(Boolean), until: 'by-hand' }] },
    { kind: 'set', id: idOf(effect), field: 'afterCombat', before: { exists: false }, value: { suggestedMinutes: count, instruction, ...extra } },
  ]
}

function closingCountdown({ effect, stored }: Card, timer: StoredTimer, closeRound: number): CardChange[] {
  return afterCombat(effect, remaining(countdownDue(landedRound(stored), timer.rounds), closeRound), AFTER_WORDS[timer.kind], { countdown: timer.kind })
}

/** Dazed suggests the larger of its Movement and Action Stages still to come, one round a minute. */
function closingLost({ effect }: Card, lost: Lost, closeRound: number): CardChange[] {
  const count = Math.max(lost.movement.filter((round) => round >= closeRound).length, lost.action.filter((round) => round >= closeRound).length)
  return count ? afterCombat(effect, count, AFTER_WORDS.window) : [stepDown(effect)]
}

function closingStep({ effect, stored }: Card, closeRound: number): CardChange[] {
  if (stored.step!.until === 'next-round-end') return afterCombat(effect, remaining(briefWindowEnd(landedRound(stored)), closeRound), AFTER_WORDS.window)
  return stored.step!.until === 'combat-end' ? [stepDown(effect)] : []
}

/** Closing one card: an unfired countdown first, then lost stages, then what its current step says. */
function closingChanges(card: Card, closeRound: number): CardChange[] {
  const { step, converted, timer, lost } = card.stored
  if (!step || converted) return []
  if (timer && !timer.fired) return closingCountdown(card, timer, closeRound)
  return lost ? closingLost(card, lost, closeRound) : closingStep(card, closeRound)
}

/** Every closing change for one combatant's cards from this fight; closing adds no Trauma and raises no Death Save. */
export function closeWoundLifetimes({ effects, fightId, round }: SheetLifetimeInput): SheetLifetimePlan {
  const changes = cardsOf(effects).filter((card) => fromFight(card.stored, fightId)).flatMap((card) => closingChanges(card, round))
  return { changes, traumaDelta: 0, bleeding: [], critical: [] }
}
