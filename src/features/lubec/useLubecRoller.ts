import { createContext, useContext, useState } from 'react'
import { lubecCoreRollMode, rollLubecCheck, type LubecAdvantage } from '../ruleSets/lubec/checkRoll'
import type { LubecRollAction } from '../ruleSets/lubec/rollModes'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { cryptoLubecDice, type LubecDice } from '../ruleSets/lubec/dice'
import { withLubecLastRoll, type LubecLastRoll } from '../ruleSets/lubec/lastRoll'
import { rollLubecPanic, withLubecPanicDismissed, withLubecPanicEffect } from '../ruleSets/lubec/panicRoll'
import { rollLubecRecovery } from '../ruleSets/lubec/recoveryRoll'
import type { LubecValueName } from '../ruleSets/lubec/sheet'

// The dice the sheet rolls with. Nothing provides it in the app, so every roll
// uses the browser's crypto random; a test provides seeded dice around the tab.
export const LubecDiceContext = createContext<LubecDice>(cryptoLubecDice)

/** How the owner or the GM records a roll, or a Panic row's effect, on the character; absent for anyone else. */
export type LubecRolled = (sheet: LubecCharacterSheet) => void

export type LubecRoller = {
  /** The mode set by hand for the next roll only, or null to take it from the cards; every roll made puts it back to null. */
  advantage: LubecAdvantage | null
  /** Sets the mode for the next roll by hand, or, when it is already set, hands it back to the cards. */
  toggleAdvantage: (mode: LubecAdvantage) => void
  /** The mode a Stat or Save would roll with now, and the cards that set it when the player has not. */
  modeFor: (name: LubecValueName) => { mode: LubecAdvantage; because: string | null }
  /** The narrow kind of action the next roll is, which some cards read; cleared by the roll. */
  action: LubecRollAction | null
  setAction: (action: LubecRollAction | null) => void
  /** The skill armed for the next Stat Check or Save only. */
  armed: string | null
  toggleArmed: (name: string) => void
  roll: (name: LubecValueName) => void
  panic: () => void
  recover: () => void
  /** Adds the last roll's Panic row as an effect and applies its changes. */
  addPanicEffect: () => void
  /** Clears the last roll's Panic row without adding it, changing nothing else. */
  dismissPanicResult: () => void
}

/** A switch's next value: the one pressed, or `off` when it was already on. */
const lubecToggled = <Value>(current: Value, pressed: Value, off: Value): Value => (current === pressed ? off : pressed)

/** The Core page's roller for a viewer who may roll on the character; null for anyone else. */
export function useLubecRoller(sheet: LubecCharacterSheet, onRolled: LubecRolled | null): LubecRoller | null {
  const dice = useContext(LubecDiceContext)
  const [advantage, setAdvantage] = useState<LubecAdvantage | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const [action, setAction] = useState<LubecRollAction | null>(null)
  const actions = action ? [action] : []
  if (!onRolled) return null
  const record = (next: LubecCharacterSheet | null) => {
    if (next) onRolled(next)
  }
  // A roll made with the mode uses it up; one that was never made leaves it set.
  const recordRoll = (roll: LubecLastRoll | null) => {
    if (!roll) return
    setAdvantage(null)
    setAction(null)
    onRolled(withLubecLastRoll(sheet, roll))
  }
  return {
    advantage,
    toggleAdvantage: (mode) => setAdvantage((current) => lubecToggled<LubecAdvantage | null>(current, mode, null)),
    modeFor: (name) => (advantage === null ? lubecCoreRollMode(sheet, name, actions) : { mode: advantage, because: null }),
    action,
    setAction,
    armed,
    toggleArmed: (name) => setArmed((current) => lubecToggled<string | null>(current, name, null)),
    roll: (name) => {
      const roll = rollLubecCheck(sheet, { name, advantage, skill: armed, actions }, dice)
      if (roll) setArmed(null)
      recordRoll(roll)
    },
    panic: () => recordRoll(rollLubecPanic(sheet, advantage ?? 'normal', dice)),
    recover: () => recordRoll(rollLubecRecovery(sheet, advantage ?? 'normal', dice)),
    addPanicEffect: () => record(withLubecPanicEffect(sheet, dice, crypto.randomUUID())),
    dismissPanicResult: () => record(withLubecPanicDismissed(sheet)),
  }
}
