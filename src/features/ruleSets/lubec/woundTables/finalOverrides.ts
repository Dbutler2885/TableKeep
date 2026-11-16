// The one list of rows whose displayed words differ from the final file,
// because a settled term or the captain's decisions override what the row
// says. The conformance test allows exactly these and no other difference.
//
// Known settled overrides, added to this list as each table lands:
// - Gunshot Head 3: the concussion success is the terms' Severe Concussion success (no temporary -10 Intellect).
// - Gunshot Head 4 and 5+: -10 / -20 Intellect is the wound's whole lasting Intellect penalty, without the concussion's further -10.
// - Every crushed or destroyed hand's "-60 Handle" reads "Handle drops to 10".
// - Discretionary Charm becomes the situational Charm reminder.
// - Thrown's slow bleed uses the slow-bleed card, although the terms say Blunt Force only.

export type LubecFinalOverride = {
  table: string
  parts: string[]
  impact: number
  /** The words the app shows instead of the file's. */
  text: string
  /** Which settled decision makes the difference. */
  why: string
}

export const LUBEC_FINAL_OVERRIDES: readonly LubecFinalOverride[] = []
