// The one list of rows whose displayed words differ from the final file,
// because a settled term or the captain's decisions override what the row
// says. The conformance test allows exactly these and no other difference.
//
// Overrides that change what a row does but not its words are not listed here, because the words already say
// it; they are pinned by the landing tests instead:
// - Discretionary Charm ("-10 Charm at GM discretion") is the situational Charm reminder, never a Charm change.
// - Every crushed or destroyed hand reads "Handle drops to 10" (the final files already print it).
// - Thrown Waist 6 uses the final table's manual +1 Trauma every 30 minutes until Basic First Aid; this later final row overrides the older terms' Blunt-Force-only scope.

export type LubecFinalOverride = {
  table: string
  parts: string[]
  impact: number
  /** The words the app shows instead of the file's. */
  text: string
  /** Which settled decision makes the difference. */
  why: string
}

const SKULL_HIT_FILE = 'Severe Concussion. Body Save. Success: Minor Concussion—Dazed, with `-10 Handle` and `-10 Intellect` until 1 Long Rest; +1 Trauma instead of +2.'
const WHOLE_INTELLECT = ' The concussion adds no lasting Intellect of its own: this is the wound\'s whole lasting Intellect loss.'

export const LUBEC_FINAL_OVERRIDES: readonly LubecFinalOverride[] = [
  {
    table: 'gunshot', parts: ['head'], impact: 3,
    text: 'Severe Concussion. Body Save. Success: Minor Concussion—Dazed, with `-10 Handle` until 1 Long Rest; +1 Trauma instead of +2. Failure: Dazed and `-30 Handle`. After 1 Long Rest: `-10 Handle`. After 2 Long Rests: the Handle penalty clears; *Persistent concussion*, lasting `-10 Intellect`.',
    why: `The terms' Severe Concussion success is a Minor Concussion with no Intellect penalty; the file says "${SKULL_HIT_FILE}"`,
  },
  {
    table: 'gunshot', parts: ['head'], impact: 4,
    text: `Apply the Skull hit concussion effects at Impact 3, including Dazed, its concussion Body Save, penalties and recovery. Retain +2 Trauma regardless of the concussion Save. Death Save in d4 turns unless a separate Body Save succeeds. If survived, lasting: \`-10 Intellect\`, \`-10 Body\`, and \`+4 minimum Stress\`.${WHOLE_INTELLECT}`,
    why: 'The row\'s lasting -10 Intellect is the whole lasting Intellect loss, without the embedded concussion failure\'s further -10.',
  },
  {
    table: 'gunshot', parts: ['head'], impact: 5,
    text: `Immediate Death Save. If survived: apply the Skull hit concussion effects at Impact 3, including Dazed, its concussion Body Save, penalties and recovery. Retain +4 Trauma regardless of the concussion Save. If survived, lasting: \`-20 Intellect\`, \`-20 Body\`, and \`+8 minimum Stress\`.${WHOLE_INTELLECT}`,
    why: 'The row\'s lasting -20 Intellect is the whole lasting Intellect loss, without the embedded concussion failure\'s further -10.',
  },
]
