import type { LubecEffect } from '../effects'
import type { LubecWoundNow, LubecWoundOutcome } from '../woundTables/outcome'
import { dazedTurns, STAGE_KEYS, woundCards, type LostByCard, type StageLoss } from './cards'
import { briefWindowEnd, countdownDue } from './stored'
import type { LandingInput, LandingPlan, Lost, PublicLanding, TimerKind } from './types'

// Lost stages, resolved into round numbers the moment the wound lands, from
// the target's state at that moment. A combatant's Action Stage is resolved
// once their own attack turn has opened (or was passed); Full Defense, a Run
// and a declaration with no attack leave it unresolved all round, so losing the
// Action then takes the Defense too. Movement always resolves before anyone is
// wounded, so losing the next Movement Stage always means next round. The same
// rounds go on the card, into its words and to the fight.

type At = NonNullable<LandingInput['at']>

const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => from + index)

/** Whether the target's Action Stage this round is still to come: a round has begun and their own attack turn has not opened. */
const actionOpen = (at: At): boolean => at.round >= 1 && !at.actionTaken

/** The rounds a stage-losing consequence takes: the next Movement is next round's, the next Action this round's while it is still open. */
function lostRoundsOf(now: StageLoss, at: At, turns: number): Lost {
  const action = actionOpen(at) ? at.round : at.round + 1
  if (now.kind === 'lose-movement') return { movement: [at.round + 1], action: [] }
  if (now.kind === 'lose-action') return { movement: [], action: [action] }
  return { movement: range(at.round + 1, turns), action: range(action, turns) }
}

const isStageLoss = (now: LubecWoundNow): now is StageLoss => now.kind in STAGE_KEYS

/** Each stage-losing consequence's rounds, by its card; a second consequence of one kind takes the first one's place. */
function lostByCardOf(outcome: LubecWoundOutcome, rolled: LandingInput['context']['rolled'], at: At): LostByCard {
  const lost: LostByCard = {}
  for (const now of (outcome.now ?? []).filter(isStageLoss)) lost[STAGE_KEYS[now.kind]] = lostRoundsOf(now, at, dazedTurns(now, rolled))
  return lost
}

const LOSS_REASONS = { dazed: 'Dazed', movement: 'Movement lost', action: 'Action lost' } as const

const hasNow = (outcome: LubecWoundOutcome, kind: LubecWoundNow['kind']) => outcome.now?.some((now) => now.kind === kind) ?? false

/** The fight's stage losses, in consequence order; being knocked down also takes this round's Action while it is still open. */
function lossesOf(outcome: LubecWoundOutcome, lostByCard: LostByCard, at: At): PublicLanding['losses'] {
  const losses = (Object.entries(lostByCard) as [keyof LostByCard, Lost][]).map(([key, rounds]) => ({ rounds, reason: LOSS_REASONS[key] }))
  const down = hasNow(outcome, 'knocked-down') && actionOpen(at) ? [{ rounds: { movement: [], action: [at.round] }, reason: 'Knocked down' }] : []
  return [...losses, ...down]
}

type Countdown = { kind: TimerKind; rounds: number }
const countdownOfCard = (card: LubecEffect): Countdown | null => (card.countdown as Countdown | undefined) ?? null

/** The last round whose end must be processed for a card: a countdown's due round, its last lost stage, or the end of a brief window. */
function cardWatchEnds(card: LubecEffect, round: number): number[] {
  const countdown = countdownOfCard(card)
  if (countdown) return [countdownDue(round, countdown.rounds)]
  const lost = card.lost as Lost | undefined
  if (lost) return [Math.max(...lost.movement, ...lost.action)]
  return card.steps[0]?.until === 'next-round-end' ? [briefWindowEnd(round)] : []
}

function publicLanding(outcome: LubecWoundOutcome, cards: readonly LubecEffect[], lostByCard: LostByCard, at: At): PublicLanding {
  const ends = cards.flatMap((card) => cardWatchEnds(card, at.round))
  return {
    losses: lossesOf(outcome, lostByCard, at),
    unconscious: hasNow(outcome, 'unconscious'),
    outOfReach: hasNow(outcome, 'out-of-reach'),
    watchThrough: ends.length ? Math.max(...ends) : null,
    countdowns: cards.flatMap((card) => {
      const countdown = countdownOfCard(card)
      return countdown ? [{ wound: card.name, kind: countdown.kind, dueRound: countdownDue(at.round, countdown.rounds) }] : []
    }),
  }
}

const wholeIn = (value: number, low: number, high: number) => Number.isSafeInteger(value) && value >= low && value <= high

function requireLanding({ context, at }: LandingInput): void {
  if (at && !wholeIn(at.round, 0, Number.MAX_SAFE_INTEGER)) throw new Error(`A wound cannot land in round ${at.round}.`)
  const { dazed } = context.rolled
  if (dazed !== undefined && !wholeIn(dazed, 1, 4)) throw new Error(`A daze cannot take ${dazed} turns.`)
}

/** A final wound landing: its cards and, in a fight's rounds, what the fight does with it, from one reading of its rounds. */
export function landWoundLifetime(input: LandingInput): LandingPlan {
  requireLanding(input)
  const { outcome, context, at } = input
  const lostByCard = at ? lostByCardOf(outcome, context.rolled, at) : null
  const cards = woundCards(outcome, context, lostByCard)
  return { cards, public: at && lostByCard ? publicLanding(outcome, cards, lostByCard, at) : null }
}
