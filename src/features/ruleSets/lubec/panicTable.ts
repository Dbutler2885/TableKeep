// The Panic table from the Lubec rules (canonical-playtest-draft-v7-lubec-rules-v3.md),
// used without modification; Table Keep owns this copy.
// A row's structured changes are only the rolling character's own Stress and
// Minimum Stress changes. Everything else a row says stays in its text.

export type LubecPanicCounter = 'stress' | 'minimumStress'

export type LubecPanicChange =
  | { counter: LubecPanicCounter; amount: number }
  | { counter: LubecPanicCounter; sign: 1 | -1; dice: { count: number; sides: number } }

export type LubecPanicRow = {
  /** The d20 result that picks this row, 1 to 20. */
  roll: number
  name: string
  text: string
  changes: readonly LubecPanicChange[]
}

const gainStress = (amount: number): LubecPanicChange => ({ counter: 'stress', amount })
const raiseMinimumStress = (amount: number): LubecPanicChange => ({ counter: 'minimumStress', amount })
const reduceStressBy = (sides: number): LubecPanicChange => ({ counter: 'stress', sign: -1, dice: { count: 1, sides } })

const row = (roll: number, name: string, text: string, changes: readonly LubecPanicChange[] = []): LubecPanicRow =>
  ({ roll, name, text, changes })

export const LUBEC_PANIC_TABLE: readonly LubecPanicRow[] = [
  row(1, 'ADRENALINE RUSH', 'Advantage on all rolls for the next 2d10 minutes. Reduce Stress by 1d5.', [reduceStressBy(5)]),
  row(2, 'NERVOUS', 'Gain 1 Stress.', [gainStress(1)]),
  row(3, 'JUMPY', 'Gain 1 Stress. All Close Group members gain 2 Stress.', [gainStress(1)]),
  row(4, 'OVERWHEMED', 'Disadvantage on all rolls for the next 1d10 minutes. Increase Minimum Stress by 1.', [raiseMinimumStress(1)]),
  row(5, 'COWARD', 'Gain a new Condition: You must make a Fear Save to engage in violence, otherwise you flee.'),
  row(6, 'FRIGHTENED', 'Gain a new Condition: When encountering what frightened you, make a Fear Save at Disadvantage or gain 1d5 Stress.'),
  row(7, 'NIGHTMARES', 'Gain a new Condition: Sleep is difficult; Rest Saves are at Disadvantage.'),
  row(8, 'LOSS OF CONFIDENCE', 'Gain a new Condition: Choose one Skill and lose that Skill’s bonus.'),
  row(9, 'DEFLATED', 'Gain a new Condition: Whenever a Close Group member fails a Save, gain 1 Stress.'),
  row(10, 'DOOMED', 'Gain a new Condition: You feel cursed and unlucky. All Critical Successes are instead Critical Failures.'),
  row(11, 'SUSPICIOUS', 'Whenever you talk to an adult outside of your family make a fear save or gain 1 stress.'),
  row(12, 'HAUNTED', 'Gain a new Condition: Something starts visiting the character at night. In their dreams. Out of the corner of their eye. And soon it will start making demands.'),
  row(13, 'DEATH WISH', 'For the next 24 hours, whenever encountering a stranger or known enemy, make a Sanity Save or immediately attack them.'),
  row(14, 'PROPHETIC VISION', 'Character immediately experiences an intense hallucination or vision of an impending terror or horrific event. Increase Minimum Stress by 2.', [raiseMinimumStress(2)]),
  row(15, 'CATATONIC', 'Become unresponsive and unmoving for 2d10 minutes. Reduce Stress by 1d10.', [reduceStressBy(10)]),
  row(16, 'RAGE', 'Advantage on all Damage rolls for the next 1d10 hours. All Group members gain 1 Stress.'),
  row(17, 'SPIRALING', 'Gain a new Condition: Panic Checks are at Disadvantage.'),
  row(18, 'COMPOUNDING PROBLEMS', 'Roll twice on this table. Increase your Minimum Stress by 1.', [raiseMinimumStress(1)]),
  row(19, 'HEART ATTACK', 'Reduce Maximum Wounds by 1. Disadvantage on all rolls for 1d10 hours. Increase Minimum Stress by 1.', [raiseMinimumStress(1)]),
  row(20, 'Mind in Tatters', 'You have stopped making sense and you are no longer able to live in this world'),
]

/** The row a Panic Check's d20 picks, or null for a roll outside 1 to 20. */
export function lubecPanicRow(roll: number): LubecPanicRow | null {
  return LUBEC_PANIC_TABLE.find((entry) => entry.roll === roll) ?? null
}
