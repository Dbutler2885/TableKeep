import { createContext, useContext, useState } from 'react'
import { rollLubecCheck, type LubecAdvantage } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { cryptoLubecDice, type LubecDice } from '../ruleSets/lubec/dice'
import { withLubecLastRoll } from '../ruleSets/lubec/lastRoll'
import { rollLubecPanic, withLubecPanicEffect } from '../ruleSets/lubec/panicRoll'
import { rollLubecRecovery } from '../ruleSets/lubec/recoveryRoll'
import type { LubecValueName } from '../ruleSets/lubec/sheet'

// The dice the sheet rolls with. Nothing provides it in the app, so every roll
// uses the browser's crypto random; a test provides seeded dice around the tab.
export const LubecDiceContext = createContext<LubecDice>(cryptoLubecDice)

/** How the owner or the GM records a roll, or a Panic row's effect, on the character; absent for anyone else. */
export type LubecRolled = (sheet: LubecCharacterSheet) => void

export type LubecRoller = {
  advantage: LubecAdvantage
  setAdvantage: (mode: LubecAdvantage) => void
  /** The skill armed for the next Stat Check or Save only. */
  armed: string | null
  toggleArmed: (name: string) => void
  roll: (name: LubecValueName) => void
  panic: () => void
  recover: () => void
  /** Adds the last roll's Panic row as an effect and applies its changes. */
  addPanicEffect: () => void
}

/** The Core page's roller for a viewer who may roll on the character; null for anyone else. */
export function useLubecRoller(sheet: LubecCharacterSheet, onRolled: LubecRolled | null): LubecRoller | null {
  const dice = useContext(LubecDiceContext)
  const [advantage, setAdvantage] = useState<LubecAdvantage>('normal')
  const [armed, setArmed] = useState<string | null>(null)
  if (!onRolled) return null
  const record = (next: LubecCharacterSheet | null) => {
    if (next) onRolled(next)
  }
  return {
    advantage,
    setAdvantage,
    armed,
    toggleArmed: (name) => setArmed((current) => (current === name ? null : name)),
    roll: (name) => {
      const roll = rollLubecCheck(sheet, { name, advantage, skill: armed }, dice)
      if (!roll) return
      setArmed(null)
      onRolled(withLubecLastRoll(sheet, roll))
    },
    panic: () => onRolled(withLubecLastRoll(sheet, rollLubecPanic(sheet, advantage, dice))),
    recover: () => {
      const roll = rollLubecRecovery(sheet, advantage, dice)
      record(roll && withLubecLastRoll(sheet, roll))
    },
    addPanicEffect: () => record(withLubecPanicEffect(sheet, dice, crypto.randomUUID())),
  }
}
