import { describe, expect, it } from 'vitest'
import type { LubecCounters } from './characterRecord'
import type { LubecDice } from './dice'
import {
  applyLubecPanicChanges,
  describeLubecPanicChange,
  describeLubecPanicDice,
  lubecPanicPendingRow,
  lubecPanicResultRow,
  readLubecPanicRoll,
  rollLubecPanic,
  withLubecPanicDismissed,
  withLubecPanicEffect,
  type LubecPanicRoll,
} from './panicRoll'
import { lubecPanicRow, type LubecPanicRow } from './panicTable'
import { lubecCharacterSheet } from './sheetFixtures'

/** Dice that land on these faces of a die with this many sides, in order. */
const faces = (sides: number, ...results: number[]): LubecDice => () => ((results.shift() as number) - 0.5) / sides

const counters = (stress: number, minimumStress = 2): LubecCounters => ({ stress, minimumStress, trauma: 0 })

const failedPanic = (result: number, fields: Partial<LubecPanicRoll> = {}): LubecPanicRoll => ({
  kind: 'panic', target: 5, dice: [result], result, advantage: 'normal', outcome: 'failure', stressAdded: 0, effectRolls: null, ...fields,
})

const row = (roll: number) => lubecPanicRow(roll) as LubecPanicRow

describe('Lubec Panic Check', () => {
  it('succeeds only above Stress as it stood before the roll, adding no Stress either way', () => {
    const sheet = lubecCharacterSheet({ counters: counters(5) })
    expect(rollLubecPanic(sheet, 'normal', faces(20, 6))).toEqual({
      kind: 'panic', target: 5, dice: [6], result: 6, advantage: 'normal', outcome: 'success', stressAdded: 0, effectRolls: null, dismissed: false,
    })
    expect(rollLubecPanic(sheet, 'normal', faces(20, 5))).toMatchObject({ result: 5, outcome: 'failure', stressAdded: 0 })
  })

  it('keeps the higher d20 under Advantage and the lower under Disadvantage', () => {
    const sheet = lubecCharacterSheet({ counters: counters(5) })
    expect(rollLubecPanic(sheet, 'advantage', faces(20, 3, 9))).toMatchObject({ dice: [3, 9], result: 9, outcome: 'success' })
    expect(rollLubecPanic(sheet, 'disadvantage', faces(20, 3, 9))).toMatchObject({ dice: [3, 9], result: 3, outcome: 'failure' })
  })

  it('picks the row of the d20 kept, and none on a success', () => {
    expect(lubecPanicResultRow(failedPanic(7))?.name).toBe('NIGHTMARES')
    expect(lubecPanicResultRow(failedPanic(7, { outcome: 'success' }))).toBeNull()
  })

  it('holds a failed check\'s row as waiting until it is added or dismissed', () => {
    expect(lubecPanicPendingRow(failedPanic(7))?.name).toBe('NIGHTMARES')
    expect(lubecPanicPendingRow(failedPanic(7, { dismissed: false }))?.name).toBe('NIGHTMARES')
    expect(lubecPanicPendingRow(failedPanic(7, { effectRolls: [] }))).toBeNull()
    expect(lubecPanicPendingRow(failedPanic(7, { dismissed: true }))).toBeNull()
    expect(lubecPanicPendingRow(failedPanic(7, { outcome: 'success' }))).toBeNull()
  })

  it('reads a stored Panic Check, keeping the fields it does not model, and nothing malformed', () => {
    const stored = { ...failedPanic(4, { effectRolls: [null] }), rolledAt: 'night' }
    expect(readLubecPanicRoll(stored)).toEqual(stored)
    expect(readLubecPanicRoll(null)).toBeNull()
    expect(readLubecPanicRoll({ ...failedPanic(4), result: 21 })).toBeNull()
    expect(readLubecPanicRoll({ ...failedPanic(4), dice: [] })).toBeNull()
    expect(readLubecPanicRoll({ ...failedPanic(4), effectRolls: ['3'] })).toBeNull()
    expect(readLubecPanicRoll(failedPanic(4, { dismissed: true }))).toEqual(failedPanic(4, { dismissed: true }))
    expect(readLubecPanicRoll({ ...failedPanic(4), dismissed: 'yes' })).toBeNull()
    expect(readLubecPanicRoll({ ...failedPanic(4), kind: 'save' })).toBeNull()
  })

  it('describes its dice against the Stress it was rolled over', () => {
    expect(describeLubecPanicDice(failedPanic(4))).toBe('Rolled 4 vs Stress 5')
    expect(describeLubecPanicDice(failedPanic(9, { dice: [3, 9], advantage: 'advantage' }))).toBe('Advantage: 3 and 9, kept 9 vs Stress 5')
  })
})

describe('Lubec Panic "Add effect"', () => {
  it('adds the row as an effect, raises Minimum Stress, and marks the roll so it lands once', () => {
    const sheet = lubecCharacterSheet({ counters: counters(3), lastRoll: failedPanic(4) })
    const added = withLubecPanicEffect(sheet, faces(5), 'panic-1')
    expect(added?.counters).toEqual(counters(3, 3))
    expect(added?.effects).toEqual([{
      id: 'panic-1',
      name: 'OVERWHEMED',
      cause: 'Panic Check (rolled 4)',
      steps: [{ modifiers: [], labels: ['Disadvantage on all rolls for the next 1d10 minutes. Increase Minimum Stress by 1.'] }],
    }])
    expect(added?.lastRoll).toEqual(failedPanic(4, { effectRolls: [null] }))
    expect(added && withLubecPanicEffect(added, faces(5), 'panic-2')).toBeNull()
  })

  it('rolls a rolled change when pressed, and lowers Stress no further than Minimum Stress', () => {
    const calm = withLubecPanicEffect(lubecCharacterSheet({ counters: counters(6), lastRoll: failedPanic(1) }), faces(5, 3), 'a')
    expect(calm?.counters.stress).toBe(3)
    expect(calm?.lastRoll).toMatchObject({ effectRolls: [3] })

    const floored = withLubecPanicEffect(lubecCharacterSheet({ counters: counters(3), lastRoll: failedPanic(1) }), faces(5, 4), 'b')
    expect(floored?.counters.stress).toBe(2)
  })

  it('adds Stress for a row that gains it, and changes no counter for a row of text alone', () => {
    expect(withLubecPanicEffect(lubecCharacterSheet({ counters: counters(4), lastRoll: failedPanic(2) }), faces(5), 'a')?.counters.stress).toBe(5)
    const nightmares = withLubecPanicEffect(lubecCharacterSheet({ counters: counters(4), lastRoll: failedPanic(7) }), faces(5), 'b')
    expect(nightmares?.counters).toEqual(counters(4))
    expect(nightmares?.lastRoll).toMatchObject({ effectRolls: [] })
    expect(nightmares?.effects.map((effect) => effect.name)).toEqual(['NIGHTMARES'])
  })

  it('does nothing once the row was dismissed', () => {
    expect(withLubecPanicEffect(lubecCharacterSheet({ lastRoll: failedPanic(4, { dismissed: true }) }), faces(5), 'a')).toBeNull()
  })

  it('does nothing after a successful Panic Check or any other last roll', () => {
    expect(withLubecPanicEffect(lubecCharacterSheet({ lastRoll: failedPanic(7, { outcome: 'success' }) }), faces(5), 'a')).toBeNull()
    expect(withLubecPanicEffect(lubecCharacterSheet({ lastRoll: { kind: 'save', against: 'Fear' } }), faces(5), 'a')).toBeNull()
    expect(withLubecPanicEffect(lubecCharacterSheet(), faces(5), 'a')).toBeNull()
  })

  it('applies a Minimum Stress change before a Stress change, whatever the row\'s order', () => {
    const both: LubecPanicRow = {
      roll: 99,
      name: 'TEST',
      text: '',
      changes: [{ counter: 'stress', sign: -1, dice: { count: 1, sides: 10 } }, { counter: 'minimumStress', amount: 2 }],
    }
    expect(applyLubecPanicChanges(counters(8), both, [7, null])).toEqual(counters(4, 4))
  })

  it('describes each change, with its dice once rolled', () => {
    expect(describeLubecPanicChange(row(4).changes[0], null)).toBe('Increase Minimum Stress by 1')
    expect(describeLubecPanicChange(row(2).changes[0], null)).toBe('Increase Stress by 1')
    expect(describeLubecPanicChange(row(1).changes[0], null)).toBe('Reduce Stress by 1d5')
    expect(describeLubecPanicChange(row(15).changes[0], 7)).toBe('Reduce Stress by 1d10: rolled 7')
  })
})

describe('Lubec Panic row dismissed', () => {
  it('marks the roll and changes nothing else on the character', () => {
    const sheet = lubecCharacterSheet({ counters: counters(4), lastRoll: failedPanic(2) })
    const dismissed = withLubecPanicDismissed(sheet)
    expect(dismissed).toEqual({ ...sheet, lastRoll: failedPanic(2, { dismissed: true }) })
    expect(dismissed && withLubecPanicDismissed(dismissed)).toBeNull()
  })

  it('does nothing once the row was added, after a success, or after any other last roll', () => {
    expect(withLubecPanicDismissed(lubecCharacterSheet({ lastRoll: failedPanic(2, { effectRolls: [null] }) }))).toBeNull()
    expect(withLubecPanicDismissed(lubecCharacterSheet({ lastRoll: failedPanic(7, { outcome: 'success' }) }))).toBeNull()
    expect(withLubecPanicDismissed(lubecCharacterSheet({ lastRoll: { kind: 'save', against: 'Fear' } }))).toBeNull()
    expect(withLubecPanicDismissed(lubecCharacterSheet())).toBeNull()
  })
})
