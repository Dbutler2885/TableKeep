import { describe, expect, it } from 'vitest'
import {
  isLubecDeathSaveDue,
  lubecCurrentValue,
  lubecDeathSaveTrauma,
  lubecEffectiveHandle,
  lubecFinalValue,
  type LubecModifier,
} from './derivations'
import { LUBEC_VALUE_NAMES, type LubecSheet } from './sheet'
import { lubecSheet, tommyEves } from './sheetFixtures'

const finals = (sheet: LubecSheet) =>
  Object.fromEntries(LUBEC_VALUE_NAMES.map((name) => [name, lubecFinalValue(sheet, name)]))

const tommyBase = tommyEves().base

describe('Lubec final values', () => {
  it('are base + class modifier for Tommy Eves, a Working Kid', () => {
    expect(finals(tommyEves())).toEqual({
      Strength: 29, Speed: 56, Intellect: 43, Handle: 55, Charm: 53, Sanity: 30, Fear: 34, Body: 31,
    })
  })

  it('add the class choice: the Nerd’s -10 and the Overachiever’s +5 land on the chosen Stat only', () => {
    const nerd = lubecSheet({ class: { key: 'nerd', choices: { statPenalty: 'Charm' } } })
    expect(finals(nerd)).toEqual({ ...tommyBase, Intellect: 58, Charm: 38, Sanity: 50 })
    const scout = lubecSheet({ class: { key: 'scout', choices: { statBonus: 'Speed' } } })
    expect(finals(scout)).toEqual({ ...tommyBase, Speed: 56, Intellect: 48, Fear: 84 })
  })

  it('are all holes when the class is missing or unknown', () => {
    const allHoles = Object.fromEntries(LUBEC_VALUE_NAMES.map((name) => [name, null]))
    expect(finals(lubecSheet({ class: { key: null, choices: {} } }))).toEqual(allHoles)
    expect(finals(lubecSheet({ class: { key: 'wizard', choices: {} } }))).toEqual(allHoles)
  })

  it('are holes for every Stat a missing or invalid class choice could touch, and only those', () => {
    const popular = lubecSheet({ class: { key: 'popular', choices: {} } })
    expect(finals(popular)).toEqual({
      ...tommyBase, Strength: null, Speed: null, Intellect: null, Handle: null, Charm: 68, Fear: 44,
    })
    const nerd = lubecSheet({ class: { key: 'nerd', choices: { statPenalty: 'Intellect' } } })
    expect(finals(nerd)).toEqual({
      ...tommyBase, Strength: null, Speed: null, Intellect: 58, Handle: null, Charm: null, Sanity: 50,
    })
  })

  it('are a hole for just the one value whose base is missing or not whole', () => {
    const sheet = lubecSheet({ base: { ...tommyBase, Speed: null, Body: 20.5 } })
    expect(finals(sheet)).toEqual({ ...finals(tommyEves()), Speed: null, Body: null })
  })
})

describe('Lubec current values', () => {
  const handle = (amount: number): LubecModifier => ({ target: 'Handle', amount })

  it('equal the final value with no effects', () => {
    expect(lubecCurrentValue(tommyEves(), 'Handle', [])).toBe(55)
  })

  it('add every modifier on that value and ignore modifiers on others', () => {
    expect(lubecCurrentValue(tommyEves(), 'Handle', [handle(-40), handle(-5), { target: 'Body', amount: -30 }])).toBe(10)
    expect(lubecCurrentValue(tommyEves(), 'Handle', [handle(-30), { target: 'Body', amount: -30 }])).toBe(25)
    expect(lubecCurrentValue(tommyEves(), 'Speed', [{ target: 'Speed', amount: 7 }])).toBe(63)
  })

  it('never take a core Stat below 10, gear\'s Speed losses included', () => {
    expect(lubecCurrentValue(tommyEves(), 'Handle', [handle(-40), handle(-40)])).toBe(10)
    expect(lubecCurrentValue(tommyEves(), 'Speed', [{ target: 'Speed', amount: -60, source: 'gear' }])).toBe(10)
    for (const name of ['Strength', 'Speed', 'Handle', 'Intellect', 'Charm', 'Body'] as const) {
      expect(lubecCurrentValue(tommyEves(), name, [{ target: name, amount: -200 }])).toBe(10)
    }
  })

  it('keep Sanity and Fear at a floor of 0, and never raise a Stat already below 10', () => {
    expect(lubecCurrentValue(tommyEves(), 'Sanity', [{ target: 'Sanity', amount: -200 }])).toBe(0)
    expect(lubecCurrentValue(tommyEves(), 'Fear', [{ target: 'Fear', amount: -200 }])).toBe(0)
    const weak = lubecSheet({ base: { ...tommyBase, Handle: 2 } })
    expect(lubecFinalValue(weak, 'Handle')).toBe(7)
    expect(lubecCurrentValue(weak, 'Handle', [handle(-20)])).toBe(7)
    expect(lubecCurrentValue(weak, 'Handle', [{ target: 'Handle', amount: 0, setTo: 10 }])).toBe(7)
  })

  it('take fractions of the uninjured value first, multiplied and rounded down, then flat amounts, then "drops to"', () => {
    const half = { target: 'Handle', amount: 0, factor: 0.5 } as const
    const quarterOff = { target: 'Handle', amount: 0, factor: 0.75 } as const
    expect(lubecCurrentValue(tommyEves(), 'Handle', [half])).toBe(27)
    expect(lubecCurrentValue(tommyEves(), 'Handle', [half, quarterOff, handle(-5)])).toBe(15)
    expect(lubecCurrentValue(tommyEves(), 'Handle', [half, handle(-30)])).toBe(10)
    expect(lubecCurrentValue(tommyEves(), 'Handle', [{ target: 'Handle', amount: 0, setTo: 10 }, handle(5)])).toBe(10)
  })

  it('keep the Effective Handle cap and add skill bonuses only on top of the floor', () => {
    expect(lubecEffectiveHandle(tommyEves(), [handle(200)])).toBe(100)
    expect(lubecEffectiveHandle(tommyEves(), [handle(-200)])).toBe(10)
  })

  it('are a hole when the final value is', () => {
    const sheet = lubecSheet({ base: { ...tommyBase, Handle: null } })
    expect(lubecCurrentValue(sheet, 'Handle', [handle(10)])).toBeNull()
  })
})

describe('Lubec Effective Handle', () => {
  it('is current Handle', () => {
    expect(lubecEffectiveHandle(tommyEves(), [{ target: 'Handle', amount: -10 }])).toBe(45)
  })

  it('is capped at 100', () => {
    expect(lubecEffectiveHandle(tommyEves(), [{ target: 'Handle', amount: 60 }])).toBe(100)
  })

  it('adds no skill bonus, even for a fighting skill', () => {
    const fighter = lubecSheet({ skills: { free: 'Scrapping', picked: ['Boxing'] } })
    expect(lubecEffectiveHandle(fighter, [])).toBe(55)
  })

  it('is a hole when Handle is', () => {
    expect(lubecEffectiveHandle(lubecSheet({ base: { ...tommyBase, Handle: null } }), [])).toBeNull()
    expect(lubecEffectiveHandle(lubecSheet({ class: { key: null, choices: {} } }), [])).toBeNull()
  })
})

describe('Lubec Death Save threshold', () => {
  const tough = lubecSheet({ class: { key: 'tough', choices: {} } })
  const noClass = lubecSheet({ class: { key: null, choices: {} } })

  it('is 4 Trauma, or 5 for a Tough, and a hole when the class is', () => {
    expect(lubecDeathSaveTrauma(tommyEves())).toBe(4)
    expect(lubecDeathSaveTrauma(tough)).toBe(5)
    expect(lubecDeathSaveTrauma(noClass)).toBeNull()
  })

  it('is due once Trauma reaches it, and never while the class is a hole', () => {
    expect([3, 4, 5].map((trauma) => isLubecDeathSaveDue(tommyEves(), trauma))).toEqual([false, true, true])
    expect([4, 5, 6].map((trauma) => isLubecDeathSaveDue(tough, trauma))).toEqual([false, true, true])
    expect(isLubecDeathSaveDue(noClass, 9)).toBe(false)
  })
})
