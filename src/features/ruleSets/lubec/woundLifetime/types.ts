import type { LubecEffect } from '../effects'
import type { LubecWoundRolled, LubecWoundSource } from '../woundCards'
import type { LubecWoundOutcome } from '../woundTables/outcome'

// The words the wound lifetime module speaks to its callers. Every plan is
// newly allocated and every input is read only; nothing here names a sheet
// document, a revision, a receipt or a fight's stored state.

type Fields = Readonly<Record<string, unknown>>

/** The Movement and Action Stages a loss takes, by round. */
export type Lost = { movement: number[]; action: number[] }
export type TimerKind = 'bleed' | 'critical'
export type RoundContext = { fightId: string; round: number }

/** A final wound as it lands: its selected outcome, its saved snapshot and amounts, and what the fight has seen of the target this round. */
export type LandingInput = {
  /** Already selected by the saved landing rolls. */
  outcome: LubecWoundOutcome
  /** The snapshot the cards carry, the one-line cause, and the amounts the wound rolled once. */
  context: { source: Omit<LubecWoundSource, 'groupId'>; cause: string; rolled: LubecWoundRolled }
  /** The round the wound lands in and whether the target's own attack turn has opened or passed; null outside a fight's rounds. */
  at: { round: number; actionTaken: boolean } | null
}

/** What the fight does with a landed wound: losses in consequence order, incapacity, reach, and the rounds whose ends it must process. */
export type PublicLanding = {
  losses: { rounds: Lost; reason: string }[]
  unconscious: boolean
  outOfReach: boolean
  /** The last round whose end this wound needs processing for its target; null when none does. */
  watchThrough: number | null
  countdowns: { wound: string; kind: TimerKind; dueRound: number }[]
}

export type LandingPlan = {
  cards: LubecEffect[]
  /** Null outside a fight's rounds. */
  public: PublicLanding | null
}

export type PublicCountdown = { key: string; wound: string; kind: TimerKind; dueRound: number }

/** A round ending in the fight: who is in it, and the watches and countdowns its wounds left. */
export type EndRoundInput = {
  round: number
  combatants: readonly { key: string; name: string }[]
  roundWatch: Readonly<Record<string, number>> | undefined
  countdowns: readonly PublicCountdown[] | undefined
}

export type EndRoundPlan = {
  /** Watched combatants still in the fight, in watch order: each gets one tick of the ending round. */
  tickKeys: string[]
  roundWatch: Record<string, number>
  countdowns: PublicCountdown[]
  /** Countdowns falling due at this round's end, for the log once. */
  due: { key: string; name: string; wound: string; kind: TimerKind }[]
}

export type Existing = { exists: false } | { exists: true; value: unknown }

/** One conditional change to a stored Effect card, carrying the exact value it read. */
export type CardChange =
  | { kind: 'remove'; id: string; before: Fields }
  | { kind: 'set'; id: string; field: 'steps' | 'countdown' | 'afterCombat'; before: Existing; value: unknown }

export type DueCard = { id: string; name: string }

/** The sheet's stored effects as delivery read them, never parsed, and the fight and round that end. */
export type SheetLifetimeInput = RoundContext & { effects: unknown }

export type SheetLifetimePlan = {
  changes: CardChange[]
  traumaDelta: number
  /** Bleeds firing now, for the one Death Save threshold reminder. */
  bleeding: DueCard[]
  /** Critical countdowns falling due now, each its own Death Save reminder. */
  critical: DueCard[]
}

export type CardView = {
  /** The full words for what ends the card's current step. */
  trigger: string | null
  /** Only the round a fight set for it, for a wound card whose table words say the rest. */
  roundTrigger: string | null
  byHand: boolean
  /** Whether a roll in this fight's round reads the card; true without a fight. */
  activeInFight: boolean
  /** Whether the card's current step can restrict the body: it has one, and the fight has not converted it. */
  physicalRestrictionsActive: boolean
}

export type ViewInput = { effect: LubecEffect; at: RoundContext | null }
