/** Two dice rolled under a mode, and the one kept. */
export type LubecRollDice = { values: readonly number[]; kept: number; mode: 'advantage' | 'disadvantage'; because: string | null }

/** A roll's dice as the breakdown shows them: only two dice under a mode; null for one die. */
export function lubecRollDice(roll: { dice?: readonly number[]; result: number; mode?: string | null; because?: string | null }): LubecRollDice | null {
  const { dice, mode } = roll
  if (!dice || dice.length < 2 || (mode !== 'advantage' && mode !== 'disadvantage')) return null
  return { values: dice, kept: roll.result, mode, because: roll.because ?? null }
}
