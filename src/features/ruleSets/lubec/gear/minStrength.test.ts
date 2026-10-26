/**
 * A weapon's minimum Strength (spec 5.4 and 12.3): 10 Handle off for each step
 * between the tens digits, a hole in Strength gives no number, no minimum
 * gives none, and the table's number replaces the worked-out one.
 */
import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../sheetFixtures'
import {
  lubecCannotHandle,
  lubecComputedMinStrengthPenalty,
  lubecMinStrengthPenalty,
  lubecWeaponHandle,
  lubecWielder,
  lubecWithTableSays,
} from './minStrength'
import { emptyLubecGear, type LubecItem } from './gearRecord'

const sledgehammer = { minStrength: 60 }

describe('the minimum Strength penalty', () => {
  it('is -20 Handle for a minimum of 60 against Strength 45', () => {
    expect(lubecMinStrengthPenalty(sledgehammer, 45)).toBe(20)
  })

  it('is -10 Handle against Strength 59, and 0 against 60', () => {
    expect(lubecMinStrengthPenalty(sledgehammer, 59)).toBe(10)
    expect(lubecMinStrengthPenalty(sledgehammer, 60)).toBe(0)
  })

  it('is never a bonus, and has no cap', () => {
    expect(lubecMinStrengthPenalty(sledgehammer, 95)).toBe(0)
    expect(lubecMinStrengthPenalty({ minStrength: 90 }, 4)).toBe(90)
  })

  it('gives no number while Strength is a hole', () => {
    expect(lubecMinStrengthPenalty(sledgehammer, null)).toBeNull()
  })

  it('is 0 for a weapon with no minimum, even while Strength is a hole', () => {
    expect(lubecMinStrengthPenalty({}, 45)).toBe(0)
    expect(lubecMinStrengthPenalty({}, null)).toBe(0)
  })

  it("takes the table's number in place of the worked-out one, a hole in Strength included", () => {
    const told = { ...sledgehammer, handlePenaltyOverride: 10 }
    expect(lubecMinStrengthPenalty(told, 45)).toBe(10)
    expect(lubecMinStrengthPenalty(told, null)).toBe(10)
    expect(lubecMinStrengthPenalty({ ...sledgehammer, handlePenaltyOverride: 0 }, 45)).toBe(0)
    expect(lubecComputedMinStrengthPenalty(told, 45)).toBe(20)
  })

  it('works it out again once the table says nothing', () => {
    expect(lubecMinStrengthPenalty({ ...sledgehammer, handlePenaltyOverride: null }, 45)).toBe(20)
  })
})

describe("the weapon's Handle", () => {
  it('is Effective Handle less the penalty, and a hole when either is', () => {
    expect(lubecWeaponHandle(55, 20)).toBe(35)
    expect(lubecWeaponHandle(null, 20)).toBeNull()
    expect(lubecWeaponHandle(55, null)).toBeNull()
  })

  it('cannot be handled at 0 or below, and a hole says nothing', () => {
    expect(lubecCannotHandle(1)).toBe(false)
    expect(lubecCannotHandle(0)).toBe(true)
    expect(lubecCannotHandle(-10)).toBe(true)
    expect(lubecCannotHandle(null)).toBe(false)
  })
})

describe('the wielder', () => {
  it("reads current Strength and Effective Handle from the sheet, with the active effects' modifiers", () => {
    expect(lubecWielder(lubecCharacterSheet())).toEqual({ strength: 29, handle: 55 })
    const sprain = { id: 'e', name: 'Sprain', cause: 'Fell', steps: [{ modifiers: [{ target: 'Strength' as const, amount: -9 }], labels: [] }] }
    expect(lubecWielder(lubecCharacterSheet({ effects: [sprain] }))).toEqual({ strength: 20, handle: 55 })
  })

  it('reads a hole in Strength as null', () => {
    const sheet = lubecCharacterSheet()
    expect(lubecWielder({ ...sheet, base: { ...sheet.base, Strength: null } }).strength).toBeNull()
  })
})

describe("the table's own penalty", () => {
  const item = (id: string): LubecItem => ({ id, kind: 'weapon', name: id, note: '', size: 2, weight: 'normal', qty: 1, carrier: 'hands', slot: 0, minStrength: 60 })
  const gear = { ...emptyLubecGear(), items: [item('a'), item('b')] }

  it('is stored on the one weapon, and cleared with null', () => {
    const told = lubecWithTableSays(gear, 'a', 10)
    expect(told.items).toEqual([{ ...item('a'), handlePenaltyOverride: 10 }, item('b')])
    expect(lubecWithTableSays(told, 'a', null).items[0].handlePenaltyOverride).toBeNull()
  })
})
