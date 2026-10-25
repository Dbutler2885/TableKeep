import type { LubecCharacterSheet, LubecStoredEntry } from './characterRecord'
import {
  describeLubecCheckDice,
  describeLubecCheckOutcome,
  describeLubecCheckRoll,
  describeLubecOutcome,
  isLubecCritical,
  readLubecCheckRoll,
  type LubecCheckRoll,
} from './checkRoll'
import { describeLubecPanicDice, readLubecPanicRoll, type LubecPanicRoll } from './panicRoll'
import { describeLubecRecoveryDice, readLubecRecoveryRoll, type LubecRecoveryRoll } from './recoveryRoll'

// The character's last roll, of any kind: a Stat Check or Save, a Panic Check
// or a Recovery Save. Recording a roll writes it as the last roll and changes
// Stress by what the roll itself added or removed.

export type LubecLastRoll = LubecCheckRoll | LubecPanicRoll | LubecRecoveryRoll

/** A stored last roll as any roll the sheet knows, or null when it reads as none. */
export function readLubecLastRoll(entry: LubecStoredEntry | null): LubecLastRoll | null {
  if (entry?.kind === 'panic') return readLubecPanicRoll(entry)
  if (entry?.kind === 'recovery') return readLubecRecoveryRoll(entry)
  return readLubecCheckRoll(entry)
}

const stressRemoved = (roll: LubecLastRoll): number => (roll.kind === 'recovery' ? roll.stressRemoved : 0)

/** The sheet with the roll as its last roll and Stress changed by what the roll did to it. */
export function withLubecLastRoll(sheet: LubecCharacterSheet, roll: LubecLastRoll): LubecCharacterSheet {
  const stress = sheet.counters.stress + roll.stressAdded - stressRemoved(roll)
  return { ...sheet, counters: { ...sheet.counters, stress }, lastRoll: roll }
}

/** The last roll as the sheet shows it: what was rolled, the dice, the outcome, and whether it was a critical. */
export type LubecLastRollLines = { what: string; dice: string; outcome: string; critical: boolean }

const panicLines = (roll: LubecPanicRoll): LubecLastRollLines =>
  ({ what: 'Panic Check', dice: describeLubecPanicDice(roll), outcome: describeLubecOutcome(roll.outcome, 0), critical: false })

const recoveryLines = (roll: LubecRecoveryRoll): LubecLastRollLines => ({
  what: `Recovery save on ${roll.against}`,
  dice: describeLubecRecoveryDice(roll),
  outcome: describeLubecOutcome(roll.outcome, roll.stressAdded - roll.stressRemoved),
  critical: false,
})

const checkLines = (roll: LubecCheckRoll): LubecLastRollLines => ({
  what: describeLubecCheckRoll(roll),
  dice: describeLubecCheckDice(roll),
  outcome: describeLubecCheckOutcome(roll),
  critical: isLubecCritical(roll),
})

export function describeLubecLastRoll(roll: LubecLastRoll): LubecLastRollLines {
  if (roll.kind === 'panic') return panicLines(roll)
  if (roll.kind === 'recovery') return recoveryLines(roll)
  return checkLines(roll)
}
