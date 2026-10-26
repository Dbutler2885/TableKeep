/**
 * The Strength check for a heavy thing (Rule E5, spec 5.5): the roll the
 * Core roller makes for it, with Tommy Eves's Strength of 24 + 5 class = 29,
 * and when the sheet asks for it.
 */
import { describe, expect, it } from 'vitest'
import type { LubecCharacterSheet } from '../characterRecord'
import { rollLubecCheck } from '../checkRoll'
import type { LubecDice } from '../dice'
import { withLubecLastRoll } from '../lastRoll'
import { lubecCharacterSheet } from '../sheetFixtures'
import { parseLubecGear, type LubecItem } from './gearRecord'
import {
  lubecCheckOf,
  lubecNeedsStrength,
  lubecStrengthPending,
  lubecStrengthStress,
  lubecStrengthTarget,
  lubecWithCheck,
} from './strengthCheck'

/** Dice that land on these d100 results, in order. */
const rolls = (...results: number[]): LubecDice => () => ((results.shift() as number) - 0.5) / 100

const sprain = { id: 'e', name: 'Sprain', cause: 'Fell off the wharf', steps: [{ modifiers: [{ target: 'Strength' as const, amount: -9 }], labels: [] }] }

// What the prompt does: the Core roller's own Strength check, with no armed skill, then recorded as the last roll.
function rollStrength(sheet: LubecCharacterSheet, dice: LubecDice) {
  const roll = rollLubecCheck(sheet, { name: 'Strength', advantage: 'normal', skill: null }, dice)
  return roll && { roll, sheet: withLubecLastRoll(sheet, roll) }
}

const anvil: Pick<LubecItem, 'carrier' | 'weight'> = { carrier: 'car', weight: 'heavy' }

describe('the Strength check for a heavy thing', () => {
  it('rolls under current Strength, with its effects and no skill', () => {
    expect(lubecStrengthTarget(lubecCharacterSheet())).toBe(29)
    expect(lubecStrengthTarget(lubecCharacterSheet({ effects: [sprain] }))).toBe(20)
  })

  it('rolls nothing while Strength is a hole', () => {
    const hole = lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Strength: null } })
    expect(lubecStrengthTarget(hole)).toBeNull()
    expect(rollStrength(hole, rolls(1))).toBeNull()
  })

  it('adds 1 Stress on a failure, and records the roll as the last roll', () => {
    const rolled = rollStrength(lubecCharacterSheet(), rolls(30))
    expect(rolled?.roll).toMatchObject({ kind: 'stat-check', against: 'Strength', target: 29, result: 30, outcome: 'failure', stressAdded: 1 })
    expect(rolled?.sheet.counters.stress).toBe(lubecCharacterSheet().counters.stress + 1)
    expect(rolled?.sheet.lastRoll).toBe(rolled?.roll)
    expect(lubecStrengthStress(lubecCharacterSheet())).toBe(1)
  })

  it('adds 2 Stress on a failure for an Overachiever, whose failed Stat Checks add 2', () => {
    const overachiever = lubecCharacterSheet({ class: { key: 'scout', choices: { statBonus: 'Speed' } } })
    expect(lubecStrengthStress(overachiever)).toBe(2)
    expect(rollStrength(overachiever, rolls(99))?.sheet.counters.stress).toBe(overachiever.counters.stress + 2)
  })

  it('adds no Stress on a pass', () => {
    const rolled = rollStrength(lubecCharacterSheet(), rolls(29))
    expect(rolled?.roll).toMatchObject({ outcome: 'success', stressAdded: 0 })
    expect(rolled?.sheet.counters).toEqual(lubecCharacterSheet().counters)
  })

  it('records a pass, a heavy failure, and nothing for an extra heavy failure, which cannot be carried', () => {
    expect(lubecCheckOf({ weight: 'heavy' }, 'success')).toBe('pass')
    expect(lubecCheckOf({ weight: 'extra' }, 'success')).toBe('pass')
    expect(lubecCheckOf({ weight: 'heavy' }, 'failure')).toBe('fail')
    expect(lubecCheckOf({ weight: 'extra' }, 'failure')).toBeNull()
  })
})

describe('when the sheet asks (Rule E5)', () => {
  it('asks when a heavy or extra heavy thing comes onto you, by add, move or edit, worn armor included', () => {
    for (const dest of ['backpack#0', 'backpack#small', 'hands', 'body#1', 'worn']) expect(lubecNeedsStrength({ weight: 'heavy' }, dest, null)).toBe(true)
    expect(lubecNeedsStrength({ weight: 'extra' }, 'hands', anvil)).toBe(true)
  })

  it('never asks about a normal thing, or a thing going into a carrier', () => {
    expect(lubecNeedsStrength({ weight: 'normal' }, 'hands', null)).toBe(false)
    expect(lubecNeedsStrength({ weight: 'heavy' }, 'car', null)).toBe(false)
  })

  it('asks again about a thing already on you only when its weight changed', () => {
    expect(lubecNeedsStrength({ weight: 'heavy' }, 'hands', { carrier: 'backpack', weight: 'heavy' })).toBe(false)
    expect(lubecNeedsStrength({ weight: 'extra' }, 'hands', { carrier: 'backpack', weight: 'heavy' })).toBe(true)
    expect(lubecNeedsStrength({ weight: 'heavy' }, 'worn', { carrier: 'body', weight: 'normal' })).toBe(true)
  })

  it('lists the heavy things on you that came with no roll, and none in a carrier or already rolled', () => {
    const gear = parseLubecGear({
      items: [
        { id: 'a', name: 'Small anvil', carrier: 'backpack', pocket: 0, size: 1, weight: 'heavy' },
        { id: 'b', name: 'Mushroom anchor', carrier: 'hands', slot: 0, size: 1, weight: 'extra', check: 'pass' },
        { id: 'c', name: 'Cinder block', carrier: 'car', pocket: 0, size: 1, weight: 'heavy' },
        { id: 'd', name: 'Lead helmet', carrier: 'worn', size: 1, weight: 'extra', kind: 'armor' },
        { id: 'e', name: 'Flashlight', carrier: 'body', slot: 0, size: 1, weight: 'normal' },
      ],
    })
    expect(lubecStrengthPending(gear).map((i) => i.id)).toEqual(['a', 'd'])
  })

  it('sets a thing\'s recorded roll, the card\'s switch, and leaves gear without it as it is', () => {
    const gear = parseLubecGear({ items: [{ id: 'a', name: 'Small anvil', carrier: 'backpack', pocket: 0, size: 1, weight: 'heavy' }] })
    expect(lubecWithCheck(gear, 'a', 'fail').items[0].check).toBe('fail')
    expect(lubecWithCheck(gear, 'gone', 'fail')).toBe(gear)
  })
})
