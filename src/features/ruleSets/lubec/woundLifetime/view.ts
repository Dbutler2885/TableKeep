import { lubecStepRestrictions, lubecStepRolls, lubecStepTaskModifiers, type LubecEffect, type LubecEffectStep } from '../effects'
import { lubecEffectWound, lubecStepTrigger } from '../woundCards'
import { briefWindowEnd, fromFight, storedCard, type StoredCard } from './stored'
import type { CardView, RoundContext, ViewInput } from './types'

// One Effect card as its readers see it: what ends it, whether the table
// resolves it by hand, and whether a fight's round reads it yet. The card's
// words name a round from whatever round metadata they can, more leniently
// than a sheet tick acts on it, so an older card still says when it ends.

/** "Ends with round 3": the round a fight's brief window ends with. */
function windowTrigger(card: StoredCard): string | null {
  const landed = card.origin?.originatingRound
  return Number.isInteger(landed) ? `Ends with round ${briefWindowEnd(landed as number)}` : null
}

/** "Due at the end of round 5": an unfired countdown whose rounds and landing round are both known. */
function countdownTrigger(card: StoredCard): string | null {
  const landed = card.origin?.originatingRound
  const countdown = card.countdown
  if (countdown && !countdown.fired && Number.isInteger(countdown.rounds) && Number.isInteger(landed)) {
    return `Due at the end of round ${(landed as number) + (countdown.rounds as number)}`
  }
  return null
}

/** Only the round the fight set for the current step; nothing for a card that lists the rounds it takes, as its words already say. */
function roundTrigger(card: StoredCard): string | null {
  if (card.lost) return null
  if (card.step?.until === 'next-round-end') return windowTrigger(card)
  if (card.step?.until === 'rounds') return countdownTrigger(card)
  return null
}

/**
 * Which kinds of consequence the app plays by itself yet. Anything else on a card is resolved by hand, and the
 * card and the Results say so; as each is automated its switch turns on, for every card old or new.
 */
const AUTOMATED = {
  rolls: true,
  /** Hands, two-handed actions, Run, Evasive and crawling; speech is shown as its words, for the table to play. */
  restrictions: true,
  taskModifiers: true,
  /** Lost stages, Dazed, knocked down, unconscious. */
  stages: true,
  /** "Until the end of the next round": the round tick ends it. */
  windows: true,
  /** Round countdowns and stage counts: "in d4 rounds", Dazed. */
  rounds: false,
  /** Rest-of-combat steps ending when the fight ends. */
  closing: true,
  /** A delayed speech-recovery Body Save offered by the Step down that reaches its step. */
  speechSave: true,
}

const STAGE_CARDS = ['movement', 'action', 'dazed', 'down', 'unconscious']

type StepFeature = (effect: LubecEffect, step: LubecEffectStep, card: StoredCard) => boolean
const STEP_FEATURES: Record<keyof typeof AUTOMATED, StepFeature> = {
  rolls: (_, step) => lubecStepRolls(step).length > 0,
  restrictions: (_, step) => lubecStepRestrictions(step).some((restriction) => restriction.kind !== 'down' && restriction.kind !== 'unconscious'),
  taskModifiers: (_, step) => lubecStepTaskModifiers(step).length > 0,
  stages: (effect) => STAGE_CARDS.includes(String(effect.cardKey)),
  rounds: (_, step, card) => step.until === 'rounds' && !card.marked.countdown && !card.marked.lost,
  windows: (_, step) => step.until === 'next-round-end',
  closing: (_, step) => step.until === 'combat-end',
  speechSave: (_, step) => typeof step.onReach === 'object' && step.onReach !== null,
}

/** Whether any part of a wound card's current step is still resolved by hand. */
function byHand(effect: LubecEffect, card: StoredCard): boolean {
  const step = effect.steps[0]
  if (!step || !lubecEffectWound(effect)) return false
  return (Object.keys(STEP_FEATURES) as (keyof typeof STEP_FEATURES)[])
    .some((feature) => !AUTOMATED[feature] && STEP_FEATURES[feature](effect, step, card))
}

/**
 * Whether a roll in this fight's round reads the card. An after-combat card is the table's to resolve, so no fight
 * reads it; a card from this fight waits for its effective round, and a brief window stops counting the round after
 * it ends, before the tick's write removes it.
 */
function activeInFight(card: StoredCard, at: RoundContext | null): boolean {
  if (!at) return true
  if (card.converted) return false
  if (!fromFight(card, at.fightId)) return true
  const origin = card.origin!
  const pending = at.round < (origin.effectiveRound as number)
  const expired = card.step?.until === 'next-round-end' && at.round > briefWindowEnd(origin.originatingRound as number)
  return !pending && !expired
}

export function readWoundLifetime({ effect, at }: ViewInput): CardView {
  const card = storedCard(effect)
  const round = roundTrigger(card)
  return {
    trigger: round ?? (card.lost ? null : lubecStepTrigger(effect.steps[0])),
    roundTrigger: round,
    byHand: byHand(effect, card),
    activeInFight: activeInFight(card, at),
    physicalRestrictionsActive: !card.converted && effect.steps[0] !== undefined,
  }
}
