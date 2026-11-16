// The Lubec wound tables by hit location, as data. Source: lubec-hit-location-tables/report.md,
// section 3 (PROVISIONAL DRAFT). Severity sets Trauma; a row's words are what the GM and the
// player read. Nothing here rolls dice or touches a sheet.

export type LubecWoundSeverity = 'Minor' | 'Serious' | 'Severe' | 'Critical' | 'Catastrophic'

/** One of the two wounds a d2 row names. */
export type LubecWoundChoice = { name: string; text: string; injury?: string }

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
}

/** The rows for one or more body regions that read alike. */
export type LubecWoundLocation = { parts: string[]; rows: LubecWoundTableRow[] }

export type LubecWoundTable = { key: string; name: string; locations: LubecWoundLocation[] }
