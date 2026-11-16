import type { LubecModifier } from '../derivations'
import type { LubecFraction, LubecSetTo, LubecStepUntil } from '../effects'

// What a final wound row does, as data the app can play: every ongoing
// consequence grouped into cards that recover on their own schedule, each card
// an ordered list of steps. The row's prose stays the final file's words; this
// is how the app reads them. Nothing here rolls dice or touches a sheet.

/** One step of a card, as the table writes it. Amounts are fixed, except a per-finger loss, which counts the fingers the wound rolled. */
export type LubecWoundStepSpec = {
  until: LubecStepUntil
  modifiers?: LubecModifier[]
  fractions?: LubecFraction[]
  setTo?: LubecSetTo[]
  /** What the sheet shows for the step but does not compute. */
  labels?: string[]
  /** A Handle loss for each finger the wound took, added to the step's flat modifiers. */
  perFinger?: number
}

/** One separately recovering consequence: its sub-name under the wound, and its steps from landing on. */
export type LubecWoundCardSpec = {
  /** Stable within the row; it names the card's id on the sheet. */
  key: string
  /** What the card is, under the wound's name: "Arm", "Bleeding", "Dazed". */
  part: string
  steps: LubecWoundStepSpec[]
}

/** Everything a final row or one of its versions gives. */
export type LubecWoundOutcome = {
  cards: LubecWoundCardSpec[]
}

/** The final source a row was transcribed from: its file and that file's SHA-256 at transcription. */
export type LubecWoundContentVersion = string
