import type { LubecWoundConcussion, LubecWoundContentVersion, LubecWoundOutcome } from './outcome'

// The Lubec wound tables by hit location, as data. Rows with an `outcome` are transcribed from the
// final tables (`final/`), with their source's content version; the rest are still the provisional
// draft (lubec-hit-location-tables/report.md, section 3) and land as words resolved by hand.
// Severity sets Trauma; a row's words are what the GM and the player read. Nothing here rolls dice
// or touches a sheet.

export type LubecWoundSeverity = 'Minor' | 'Serious' | 'Severe' | 'Critical' | 'Catastrophic'

/** One of the two wounds a d2 row names; a final row's carries what it does. */
export type LubecWoundChoice = { name: string; text: string; injury?: string; outcome?: LubecWoundOutcome }

/** A Body Save that picks the row's version: success uses its own words and Trauma, failure the row as printed. */
export type LubecWoundSave = { successTrauma: number; success: string; failure: string }

export type LubecWoundTableRow = {
  /** The first Impact this row covers. */
  impact: number
  /** The last row of a location: it covers every higher Impact too. */
  orMore?: true
  severity: LubecWoundSeverity
  trauma: number
  name: string
  /** What the wound does, as drafted; empty when the name says it all or a save or d2 decides it. */
  text: string
  /** The named lasting injury the wound leaves (see LUBEC_LASTING_INJURIES). */
  injury?: string
  save?: LubecWoundSave
  /** A d2 picks one of these. */
  choices?: [LubecWoundChoice, LubecWoundChoice]
  /** The target is Out of the fight (knocked unconscious). */
  out?: true
  /** A final row: what it does, as cards. Its `text` is then the final file's prose. A d2 row's branches add to it. */
  outcome?: LubecWoundOutcome
  /** A concussion the terms define, decided by a Body Save when the wound lands. */
  concussion?: LubecWoundConcussion
  /** Fisticuffs' "Catch their fist": a Handle Check whose failure gives no wound and no Stress. */
  fistCatch?: true
  /** The final source the row was transcribed from. */
  contentVersion?: LubecWoundContentVersion
}

/** The rows for one or more body regions that read alike. */
export type LubecWoundLocation = { parts: string[]; rows: LubecWoundTableRow[] }

export type LubecWoundTable = { key: string; name: string; locations: LubecWoundLocation[] }
