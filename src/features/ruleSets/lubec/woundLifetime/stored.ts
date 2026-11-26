import type { Lost, TimerKind } from './types'

// The round metadata a stored Effect card carries, read in place. Each part is
// read on its own, because each reader of it has always accepted a different
// amount: a sheet tick only acts on a countdown that names its kind and a whole
// number of rounds, while the card's own words name a due round from any whole
// number of rounds. The parts are never folded into one kind of card, so an
// older card carrying several of them keeps behaving as it did.

type Fields = Readonly<Record<string, unknown>>

export const isRecord = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A brief window from round R ends with round R+1. */
export const briefWindowEnd = (landed: number): number => landed + 1

/** A countdown of N rolled in round R is due at the end of round R+N: the landing round never uses one up. */
export const countdownDue = (landed: number, rounds: number): number => landed + rounds

export type StoredTimer = { kind: TimerKind; rounds: number; fired?: unknown }

export type StoredCard = {
  /** The fight, wound and rounds the card was delivered under; null on a card no fight delivered. */
  origin: Fields | null
  /** The current step, when the card has one. */
  step: Fields | null
  /** The countdown as stored, whatever it holds. */
  countdown: Fields | null
  /** The countdown when a sheet tick can run it: a bleed or Critical with a whole number of rounds. */
  timer: StoredTimer | null
  /** The rounds the card's lost stages fall in, when both lists are stored. */
  lost: Lost | null
  /** Ending the fight turned it into an after-combat card for the table to resolve. */
  converted: boolean
  /** Whether a countdown or lost stages are stored at all, as the by-hand reading has always asked. */
  marked: { countdown: boolean; lost: boolean }
}

const firstStep = (steps: unknown): Fields | null => (Array.isArray(steps) && isRecord(steps[0]) ? steps[0] : null)

function timerOf(countdown: Fields | null): StoredTimer | null {
  if (!countdown || (countdown.kind !== 'bleed' && countdown.kind !== 'critical') || !Number.isInteger(countdown.rounds)) return null
  return countdown as unknown as StoredTimer
}

function lostOf(lost: unknown): Lost | null {
  return isRecord(lost) && Array.isArray(lost.movement) && Array.isArray(lost.action) ? lost as unknown as Lost : null
}

export function storedCard(effect: Fields): StoredCard {
  const countdown = isRecord(effect.countdown) ? effect.countdown : null
  return {
    origin: isRecord(effect.combatOrigin) ? effect.combatOrigin : null,
    step: firstStep(effect.steps),
    countdown,
    timer: timerOf(countdown),
    lost: lostOf(effect.lost),
    converted: effect.afterCombat !== undefined,
    marked: { countdown: Boolean(effect.countdown), lost: Boolean(effect.lost) },
  }
}

/** Whether the card was delivered by this fight. */
export const fromFight = (card: StoredCard, fightId: string): boolean => card.origin?.fightId === fightId

/** The round the card's wound landed in, as stored. */
export const landedRound = (card: StoredCard): number => card.origin!.originatingRound as number
