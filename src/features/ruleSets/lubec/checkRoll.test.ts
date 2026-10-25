import { describe, expect, it } from 'vitest'
import { LUBEC_STARTING_COUNTERS, type LubecCharacterSheet } from './characterRecord'
import {
  describeLubecCheckOutcome,
  isLubecCritical,
  lubecCheckTarget,
  lubecRollSkills,
  readLubecCheckRoll,
  rollLubecCheck,
  type LubecCheckRoll,
} from './checkRoll'
import { cryptoLubecDice, rollLubecDie, type LubecDice } from './dice'
import { emptyLubecGear } from './gear/gearRecord'
import { lubecSheet } from './sheetFixtures'

const characterSheet = (overrides: Partial<LubecCharacterSheet> = {}): LubecCharacterSheet => ({
  ...lubecSheet({}),
  door: null,
  rollUp: null,
  counters: LUBEC_STARTING_COUNTERS,
  effects: [],
  lastRoll: null,
  importNotes: [],
  gear: emptyLubecGear(),
  ...overrides,
})

/** Dice that land on these d100 results, in order. */
const rolls = (...results: number[]): LubecDice => () => ((results.shift() as number) - 0.5) / 100

const strengthRoll: LubecCheckRoll = {
  kind: 'stat-check', against: 'Strength', target: 29, dice: [30], result: 30,
  advantage: 'normal', skill: null, outcome: 'failure', stressAdded: 1,
}

describe('Lubec dice', () => {
  it('rolls every face of a die from the bottom to the top of the random range', () => {
    expect(rollLubecDie(100, () => 0)).toBe(1)
    expect(rollLubecDie(100, () => 0.999999)).toBe(100)
    expect(rollLubecDie(20, () => 0.5)).toBe(11)
  })

  it('draws from the crypto random in [0, 1)', () => {
    for (let draw = 0; draw < 50; draw += 1) {
      const value = cryptoLubecDice()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('Lubec roll skills', () => {
  it('offers the character\'s own known skills once each, the free skill first', () => {
    const sheet = lubecSheet({ skills: { free: 'Boatwork', picked: ['Diving', 'Boatwork', 'Chemistry'] } })
    expect(lubecRollSkills(sheet)).toEqual([
      { name: 'Boatwork', bonus: 10, armable: true },
      { name: 'Diving', bonus: 15, armable: true },
    ])
  })

  it('lists the fighting and shooting skills as not armable', () => {
    const sheet = lubecSheet({ skills: { free: null, picked: ['Scrapping', 'Boxing', 'Firearms', 'Slingshot / Archery', 'Hunting'] } })
    expect(lubecRollSkills(sheet).map(({ name, armable }) => [name, armable])).toEqual([
      ['Scrapping', false], ['Boxing', false], ['Firearms', false], ['Slingshot / Archery', false], ['Hunting', true],
    ])
  })
})

describe('Lubec check rolls', () => {
  it('rolls under the current value with the active effects counted', () => {
    const effects = [{ id: 'e', name: 'Sprain', cause: 'Fell', steps: [{ modifiers: [{ target: 'Strength' as const, amount: -9 }], labels: [] }] }]
    expect(lubecCheckTarget(characterSheet({ effects }), 'Strength', null)).toBe(20)
  })

  it('adds a skill only when it is the character\'s own and armable', () => {
    const sheet = characterSheet({ ...lubecSheet({ skills: { free: 'Scrapping', picked: ['Diving'] } }) })
    expect(lubecCheckTarget(sheet, 'Strength', 'Diving')).toBe(44)
    expect(lubecCheckTarget(sheet, 'Strength', 'Scrapping')).toBe(29)
    expect(lubecCheckTarget(sheet, 'Strength', 'Swimming')).toBe(29)
    expect(rollLubecCheck(sheet, { name: 'Strength', advantage: 'normal', skill: 'Scrapping' }, rolls(30))).toMatchObject({ target: 29, skill: null })
  })

  it('cannot roll a hole', () => {
    const sheet = characterSheet({ class: { key: null, choices: {} } })
    expect(lubecCheckTarget(sheet, 'Body', null)).toBeNull()
    expect(rollLubecCheck(sheet, { name: 'Body', advantage: 'advantage', skill: null }, rolls())).toBeNull()
  })

  it('records a failed Stat Check with its Stress', () => {
    expect(rollLubecCheck(characterSheet(), { name: 'Strength', advantage: 'normal', skill: null }, rolls(30))).toEqual(strengthRoll)
  })

  it('adds the Overachiever\'s 2 Stress on a failed Stat Check only', () => {
    const sheet = characterSheet({ class: { key: 'scout', choices: { statBonus: 'Speed' } } })
    expect(rollLubecCheck(sheet, { name: 'Charm', advantage: 'normal', skill: null }, rolls(99))?.stressAdded).toBe(2)
    expect(rollLubecCheck(sheet, { name: 'Body', advantage: 'normal', skill: null }, rolls(99))?.stressAdded).toBe(1)
    expect(rollLubecCheck(sheet, { name: 'Charm', advantage: 'normal', skill: null }, rolls(1))?.stressAdded).toBe(0)
  })
})

describe('Lubec last roll', () => {
  it('reads a stored Stat Check or Save, keeping the fields it does not model', () => {
    const stored = { ...strengthRoll, rolledAt: 'evening' }
    expect(readLubecCheckRoll(stored)).toEqual(stored)
  })

  it('reads nothing from a missing or malformed roll', () => {
    expect(readLubecCheckRoll(null)).toBeNull()
    expect(readLubecCheckRoll({ kind: 'stat', roll: 31 })).toBeNull()
    expect(readLubecCheckRoll({ ...strengthRoll, dice: [] })).toBeNull()
    expect(readLubecCheckRoll({ ...strengthRoll, result: 101 })).toBeNull()
    expect(readLubecCheckRoll({ ...strengthRoll, skill: 7 })).toBeNull()
    expect(readLubecCheckRoll({ ...strengthRoll, advantage: 'double' })).toBeNull()
    expect(readLubecCheckRoll({ ...strengthRoll, stressAdded: -1 })).toBeNull()
  })

  it('marks a double, and only a double, critical', () => {
    expect([11, 22, 55, 99].every((result) => isLubecCritical({ ...strengthRoll, result }))).toBe(true)
    expect([1, 10, 12, 100].some((result) => isLubecCritical({ ...strengthRoll, result }))).toBe(false)
    expect(describeLubecCheckOutcome({ ...strengthRoll, result: 44, outcome: 'success', stressAdded: 0 })).toBe('Critical success')
  })
})
