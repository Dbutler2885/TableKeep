import { createContext, useContext, useState } from 'react'
import { rollLubecCheck, type LubecAdvantage, type LubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { cryptoLubecDice, type LubecDice } from '../ruleSets/lubec/dice'
import type { LubecValueName } from '../ruleSets/lubec/sheet'

// The dice the sheet rolls with. Nothing provides it in the app, so every roll
// uses the browser's crypto random; a test provides seeded dice around the tab.
export const LubecDiceContext = createContext<LubecDice>(cryptoLubecDice)

/** How the owner or the GM records a roll on the character; absent for anyone else. */
export type LubecRolled = (roll: LubecCheckRoll) => void

export type LubecRoller = {
  advantage: LubecAdvantage
  setAdvantage: (mode: LubecAdvantage) => void
  /** The skill armed for the next roll only. */
  armed: string | null
  toggleArmed: (name: string) => void
  roll: (name: LubecValueName) => void
}

/** The Core page's roller for a viewer who may roll on the character; null for anyone else. */
export function useLubecRoller(sheet: LubecCharacterSheet, onRolled: LubecRolled | null): LubecRoller | null {
  const dice = useContext(LubecDiceContext)
  const [advantage, setAdvantage] = useState<LubecAdvantage>('normal')
  const [armed, setArmed] = useState<string | null>(null)
  if (!onRolled) return null
  return {
    advantage,
    setAdvantage,
    armed,
    toggleArmed: (name) => setArmed((current) => (current === name ? null : name)),
    roll: (name) => {
      const roll = rollLubecCheck(sheet, { name, advantage, skill: armed }, dice)
      if (!roll) return
      setArmed(null)
      onRolled(roll)
    },
  }
}
