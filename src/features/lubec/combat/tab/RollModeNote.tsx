import type { CombatRollDice } from '../engine/types'

// A combat roll made under a card-set mode: both dice, the one kept, and the
// cards that set the mode. Nothing for a single die.

const pad = (value: number) => String(value).padStart(2, '0')

const hasKeptPair = (roll: CombatRollDice | null | undefined, kept: number | undefined): roll is CombatRollDice & { dice: number[] } =>
  Boolean(roll?.dice && roll.dice.length >= 2 && kept !== undefined)

export function RollModeNote({ roll, kept }: { roll: CombatRollDice | null | undefined; kept: number | undefined }) {
  if (!hasKeptPair(roll, kept)) return null
  const mode = roll.mode === 'advantage' ? 'Advantage' : 'Disadvantage'
  return <p className="note roll-mode">{roll.because ?? mode}: rolled {roll.dice.map(pad).join(' and ')}, kept {pad(kept!)}</p>
}
