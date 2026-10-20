// OSE's packed-slot capacity: the 13 movement slots, plus one slot for each STR
// threshold the character meets. This is the only place the app reads the STR
// thresholds; the Cloud Functions copy in `functions/src/oseCarrying.ts` is
// held to the same cases by `oseCarrying.function.test.ts`.

const strengthThresholds = [18, 16, 13, 9, 6, 4]
const movementSlotCount = 7 + 2 + 2 + 2

// The sheet's label on each STR slot, in row order.
export const packedStrengthSlotLabels = strengthThresholds.map((threshold) => `STR ${threshold}+`)

/** Whether each packed row is open, STR rows first, then the movement rows, which always are. An unreadable STR opens no STR row. */
export const packedSlotsUnlocked = (str: number): boolean[] => [
  ...strengthThresholds.map((threshold) => !Number.isNaN(str) && str >= threshold),
  ...Array.from({ length: movementSlotCount }, () => true),
]

/** How many packed slots a character has, read from its stored `details`. */
export function packedSlotsOf(details: unknown): number {
  const abilityScores = (details as { abilityScores?: { STR?: unknown } } | null | undefined)?.abilityScores
  const str = Number.parseInt(String(abilityScores?.STR ?? ''), 10)
  return packedSlotsUnlocked(str).filter(Boolean).length
}
