import type { LubecModifier } from '../derivations'
import type { LubecFraction, LubecRestriction, LubecRollRule, LubecSetTo, LubecStepUntil, LubecTaskModifier } from '../effects'

// What a final wound row does, as data the app can play: what happens the
// moment it lands, the Saves and Checks it asks for, and every ongoing
// consequence grouped into cards that recover on their own schedule, each card
// an ordered list of steps. The row's prose stays the final file's words; this
// is how the app reads them. Nothing here rolls dice or touches a sheet.

/** One step of a card, as the table writes it. Amounts are fixed, except a per-finger loss, which counts the fingers the wound rolled. */
export type LubecWoundStepSpec = {
  until: LubecStepUntil
  modifiers?: LubecModifier[]
  fractions?: LubecFraction[]
  setTo?: LubecSetTo[]
  /** Roll modes the step imposes, each on a scope of rolls. */
  rolls?: LubecRollRule[]
  restrictions?: LubecRestrictionSpec[]
  /** A penalty only on one kind of action ("-20 Handle on ranged and visually precise actions"). */
  taskModifiers?: LubecTaskModifier[]
  /** The GM may call for Disadvantage on a relevant Charm Check; Charm itself never changes. */
  charmReminder?: true
  /** Minimum Stress the step adds, once, when it is reached by Step down ("lasting +4 minimum Stress"). */
  minimumStress?: number
  /** What the sheet shows for the step but does not compute. */
  labels?: string[]
  /** A Handle loss for each finger the wound took, added to the step's flat modifiers. */
  perFinger?: number
  /** Reaching this step by Step down offers a Body Save once; failing it leaves the step's `failure` words as a lasting step. */
  onReach?: { save: 'Body'; failure: string }
}

/** A restriction as a table writes it: an arm or hand restriction names the struck side, which the hit decides. */
export type LubecRestrictionSpec = LubecRestriction | { kind: 'arm-unusable' | 'no-grip'; side: 'struck' }

/** One separately recovering consequence: its sub-name under the wound, and its steps from landing on. */
export type LubecWoundCardSpec = {
  /** Stable within the row; it names the card's id on the sheet. */
  key: string
  /** What the card is, under the wound's name: "Arm", "Bleeding", "Dazed". */
  part: string
  steps: LubecWoundStepSpec[]
}

/** What happens the moment the wound lands. */
export type LubecWoundNow =
  | { kind: 'lose-movement' }
  | { kind: 'lose-action' }
  /** Dazed for one turn, or for 1d4 turns rolled once at landing. */
  | { kind: 'dazed'; turns: 1 | '1d4' }
  | { kind: 'knocked-down' }
  /** Whatever the struck hand holds is dropped, at once or unless a Handle Check succeeds. */
  | { kind: 'drop'; check: boolean }
  /** Unconscious for 2d10 minutes, and +1d5 Minimum Stress, both rolled once at landing. */
  | { kind: 'unconscious'; aftermath?: 'severe-concussion' }
  | { kind: 'immediate-death-save' }
  | { kind: 'out-of-reach' }

/** A one-time countdown a single prevention Body Save stops: +1 Trauma, or a Death Save, in d4 rounds. */
export type LubecWoundTimer = 'bleed' | 'critical'

/** Everything a final row or one of its versions gives. */
export type LubecWoundOutcome = {
  now?: LubecWoundNow[]
  cards: LubecWoundCardSpec[]
  /** Countdowns, all prevented by one Body Save made when the wound lands. */
  timers?: LubecWoundTimer[]
  /** Fingers lost, rolled once: the die's sides (1d5, 1d3) or a fixed count. */
  fingers?: { sides: number } | { count: number }
}

/**
 * A concussion the row applies, by the terms: a Body Save whose success and failure versions the terms set.
 * `keepTrauma` keeps the row's Trauma whatever the Save; `noLasting` drops the failure's lasting -10 Intellect
 * where the row's own lasting Intellect replaces it; `mode` puts the Save at Disadvantage.
 */
export type LubecWoundConcussion = { kind: 'minor' | 'severe'; keepTrauma?: true; noLasting?: true; mode?: 'disadvantage' }

/** One of the two wounds a d2 picks, with what it does. */
export type LubecWoundBranch = { name: string; text: string; outcome: LubecWoundOutcome }

/** The final source a row was transcribed from: its file and the start of that file's SHA-256. */
export type LubecWoundContentVersion = string
