import { describe, expect, it } from 'vitest'
import type { LubecDice } from './dice'
import { describeLubecRecoveryDice, lubecLowestSave, readLubecRecoveryRoll, rollLubecRecovery, type LubecRecoveryRoll } from './recoveryRoll'
import { emptyLubecGear } from './gear/gearRecord'
import { lubecCharacterSheet, lubecSheet } from './sheetFixtures'

/** Dice that land on these d100 results, in order. */
const rolls = (...results: number[]): LubecDice => () => ((results.shift() as number) - 0.5) / 100

const stressed = (stress: number, minimumStress = 2) => lubecCharacterSheet({ counters: { stress, minimumStress, trauma: 0 } })

const sanityRecovery: LubecRecoveryRoll = {
  kind: 'recovery', against: 'Sanity', target: 30, dice: [23], result: 23,
  advantage: 'normal', outcome: 'success', stressAdded: 0, stressRemoved: 3,
}

describe('Lubec Recovery Save', () => {
  it('rolls against the lowest current Save, the first of a tie, with the effects counted', () => {
    expect(lubecLowestSave(lubecCharacterSheet())).toEqual({ name: 'Sanity', value: 30 })
    const bruised = [{ id: 'e', name: 'Bruise', cause: '', steps: [{ modifiers: [{ target: 'Body' as const, amount: -1 }], labels: [] }] }]
    expect(lubecLowestSave(lubecCharacterSheet({ effects: bruised }))).toEqual({ name: 'Sanity', value: 30 })
    const winded = [{ id: 'e', name: 'Winded', cause: '', steps: [{ modifiers: [{ target: 'Body' as const, amount: -5 }], labels: [] }] }]
    expect(lubecLowestSave(lubecCharacterSheet({ effects: winded }))).toEqual({ name: 'Body', value: 26 })
  })

  it('reads the Saves through the one list of modifiers, which gear\'s Speed losses never touch', () => {
    const anvil = { id: 'a', kind: 'thing' as const, name: 'Small anvil', note: '', size: 1 as const, weight: 'heavy' as const, qty: 1, carrier: 'backpack', pocket: 0, check: 'fail' as const }
    const winded = [{ id: 'e', name: 'Winded', cause: '', steps: [{ modifiers: [{ target: 'Body' as const, amount: -5 }], labels: [] }] }]
    const sheet = lubecCharacterSheet({ effects: winded, gear: { ...emptyLubecGear(), items: [anvil] } })
    expect(lubecLowestSave(sheet)).toEqual({ name: 'Body', value: 26 })
    expect(rollLubecRecovery(sheet, 'normal', rolls(20))).toMatchObject({ against: 'Body', target: 26, outcome: 'success' })
  })

  it('cannot be rolled while any Save is a hole', () => {
    const sheet = lubecCharacterSheet({ ...lubecSheet({ base: { ...lubecSheet({}).base, Fear: null } }) })
    expect(lubecLowestSave(sheet)).toBeNull()
    expect(rollLubecRecovery(sheet, 'normal', rolls())).toBeNull()
  })

  it('lowers Stress on a success by the roll\'s ones digit', () => {
    expect(rollLubecRecovery(stressed(9), 'normal', rolls(23))).toEqual(sanityRecovery)
    expect(rollLubecRecovery(stressed(9), 'normal', rolls(20))).toMatchObject({ outcome: 'success', stressRemoved: 0 })
  })

  it('stops at Minimum Stress, and never raises Stress that is already below it', () => {
    expect(rollLubecRecovery(stressed(4), 'normal', rolls(27))).toMatchObject({ stressRemoved: 2 })
    expect(rollLubecRecovery(stressed(1), 'normal', rolls(9))).toMatchObject({ outcome: 'success', stressRemoved: 0 })
  })

  it('adds 1 Stress on a failure', () => {
    expect(rollLubecRecovery(stressed(9), 'normal', rolls(31))).toMatchObject({ outcome: 'failure', stressAdded: 1, stressRemoved: 0 })
  })

  it('keeps the lower d100 under Advantage and the higher under Disadvantage', () => {
    expect(rollLubecRecovery(stressed(9), 'advantage', rolls(64, 23))).toMatchObject({ dice: [64, 23], result: 23, outcome: 'success' })
    expect(rollLubecRecovery(stressed(9), 'disadvantage', rolls(64, 23))).toMatchObject({ result: 64, outcome: 'failure' })
  })

  it('reads a stored Recovery Save, keeping the fields it does not model, and nothing malformed', () => {
    const stored = { ...sanityRecovery, rolledAt: 'dawn' }
    expect(readLubecRecoveryRoll(stored)).toEqual(stored)
    expect(readLubecRecoveryRoll({ ...sanityRecovery, against: 'Strength' })).toBeNull()
    expect(readLubecRecoveryRoll({ ...sanityRecovery, stressRemoved: -1 })).toBeNull()
  })

  it('describes its dice against the Save it rolled under', () => {
    expect(describeLubecRecoveryDice(sanityRecovery)).toBe('Rolled 23 vs 30')
  })
})
