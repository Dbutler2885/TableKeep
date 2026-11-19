import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import type { LubecLastRoll } from '../ruleSets/lubec/lastRoll'
import { lubecLastRollParts } from '../ruleSets/lubec/valueParts'
import { LubecRollBreakdown } from './LubecRollBreakdown'
import { lubecRollDice } from './lubecRollDice'

/** The shown roll's breakdown under the circles: its dice under a mode, and for a Stat Check or Save, how its target was reached. */
export function LubecShownRoll({ sheet, roll }: { sheet: LubecCharacterSheet; roll: LubecLastRoll | null }) {
  if (!roll) return null
  const name = 'against' in roll ? roll.against : 'Target'
  // Its own live region: the status line above no longer repeats the mode and dice it shows.
  return <div aria-live="polite"><LubecRollBreakdown dice={lubecRollDice({ ...roll, mode: roll.advantage })} parts={lubecLastRollParts(sheet, roll)} name={name} target={roll.target} /></div>
}
