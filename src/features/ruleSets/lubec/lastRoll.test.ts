import { describe, expect, it } from 'vitest'
import type { LubecCheckRoll } from './checkRoll'
import { describeLubecLastRoll, readLubecLastRoll, withLubecLastRoll } from './lastRoll'
import type { LubecPanicRoll } from './panicRoll'
import type { LubecRecoveryRoll } from './recoveryRoll'
import { lubecCharacterSheet } from './sheetFixtures'

const strengthRoll: LubecCheckRoll = {
  kind: 'stat-check', against: 'Strength', target: 29, dice: [33], result: 33,
  advantage: 'normal', skill: null, outcome: 'failure', stressAdded: 1,
}

const failedPanic: LubecPanicRoll = {
  kind: 'panic', target: 5, dice: [4], result: 4, advantage: 'normal', outcome: 'failure', stressAdded: 0, effectRolls: null,
}

const recovery: LubecRecoveryRoll = {
  kind: 'recovery', against: 'Sanity', target: 30, dice: [23], result: 23,
  advantage: 'normal', outcome: 'success', stressAdded: 0, stressRemoved: 3,
}

const sheet = lubecCharacterSheet({ counters: { stress: 5, minimumStress: 2, trauma: 0 } })

describe('Lubec last roll of any kind', () => {
  it('reads a stored Stat Check, Panic Check or Recovery Save, and nothing else', () => {
    expect(readLubecLastRoll(strengthRoll)).toEqual(strengthRoll)
    expect(readLubecLastRoll(failedPanic)).toEqual(failedPanic)
    expect(readLubecLastRoll(recovery)).toEqual(recovery)
    expect(readLubecLastRoll({ ...recovery, kind: 'panic' })).toBeNull()
    expect(readLubecLastRoll(null)).toBeNull()
  })

  it('writes the roll as the last roll and changes Stress only by what the roll itself did', () => {
    expect(withLubecLastRoll(sheet, strengthRoll)).toMatchObject({ lastRoll: strengthRoll, counters: { stress: 6 } })
    expect(withLubecLastRoll(sheet, failedPanic)).toMatchObject({ lastRoll: failedPanic, counters: { stress: 5 } })
    expect(withLubecLastRoll(sheet, recovery)).toMatchObject({ lastRoll: recovery, counters: { stress: 2, minimumStress: 2 } })
  })

  it('describes each kind of roll for the sheet', () => {
    expect(describeLubecLastRoll(strengthRoll))
      .toEqual({ what: 'Strength check', dice: 'Rolled 33 vs 29', outcome: 'Critical failure, +1 Stress', critical: true })
    expect(describeLubecLastRoll(failedPanic)).toEqual({ what: 'Panic Check', dice: 'Rolled 4 vs Stress 5', outcome: 'Failure', critical: false })
    expect(describeLubecLastRoll(recovery))
      .toEqual({ what: 'Recovery save on Sanity', dice: 'Rolled 23 vs 30', outcome: 'Success, -3 Stress', critical: false })
    expect(describeLubecLastRoll({ ...recovery, result: 44, outcome: 'failure', stressAdded: 1, stressRemoved: 0 }).outcome)
      .toBe('Failure, +1 Stress')
  })
})
