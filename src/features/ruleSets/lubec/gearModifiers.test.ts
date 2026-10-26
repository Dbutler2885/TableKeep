/**
 * Gear's Speed losses and the one list of modifiers every Lubec value reads
 * (spec 5.3, B's `speedMods` with keys). Tommy Eves's Speed is 51 + 5 class
 * = 56.
 */
import { describe, expect, it } from 'vitest'
import type { LubecEffect } from './effects'
import { emptyLubecGear, type LubecGear, type LubecItem } from './gear/gearRecord'
import { lubecGearModifiers, lubecPrunedOverrides, lubecSheetModifiers, lubecSwitchGearLoss } from './modifiers'
import { lubecCharacterSheet } from './sheetFixtures'
import { lubecCurrentValue } from './derivations'

const T = (id: string, carrier: string, at: number | null, name: string, extra: Partial<LubecItem> = {}): LubecItem => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at as number } : { pocket: at }), name, size: 1, qty: 1, weight: 'normal', note: '', ...extra,
})

const gearOf = (items: LubecItem[], overrides: string[] = []): LubecGear => ({ ...emptyLubecGear(), items, overrides })

const anvil = T('a', 'backpack', 0, 'Small anvil', { weight: 'heavy', check: 'fail' })
const anchor = T('m', 'hands', 0, 'Mushroom anchor', { weight: 'extra', check: 'pass' })
const buster = T('b', 'hands', 0, 'Buster', { size: 8 })

// A full inventory (Rule W6): five slots in the main pocket, both front pockets, both body slots and both hands.
const FULL = [
  T('p1', 'backpack', 0, 'Rope', { size: 4 }),
  T('p2', 'backpack', 0, 'Wool watch cap'),
  T('p3', 'backpack', 1, 'Map'),
  T('p4', 'backpack', 2, 'Compass'),
  T('b1', 'body', 0, 'Jacket'),
  T('b2', 'body', 1, 'Scarf'),
  T('h1', 'hands', 0, 'Flashlight'),
  T('h2', 'hands', 1, 'Walkie-talkie'),
]

const sprain: LubecEffect = { id: 'e1', name: 'Sprain', cause: 'Fell off the wharf', steps: [{ modifiers: [{ target: 'Speed', amount: -10 }], labels: [] }] }

const speed = (gear: LubecGear, effects: LubecEffect[] = []) => {
  const sheet = lubecCharacterSheet({ gear, effects })
  return lubecCurrentValue(sheet, 'Speed', lubecSheetModifiers(sheet))
}

describe('lubecGearModifiers', () => {
  it('gives the four losses, each with its key, amount and reason', () => {
    expect(lubecGearModifiers(gearOf([anvil]))).toEqual([
      { target: 'Speed', amount: -20, source: 'gear', key: 'heavy:a', reason: 'Small anvil: heavy, Strength failed' },
    ])
    expect(lubecGearModifiers(gearOf([anchor]))).toEqual([
      { target: 'Speed', amount: -20, source: 'gear', key: 'extra:m', reason: 'Mushroom anchor: extra heavy, always' },
    ])
    expect(lubecGearModifiers(gearOf([buster]))).toEqual([
      { target: 'Speed', amount: -20, source: 'gear', key: 'huge:b', reason: 'Buster: 8 slots, encumbering' },
    ])
    expect(lubecGearModifiers(gearOf(FULL))).toEqual([
      { target: 'Speed', amount: -10, source: 'gear', key: 'full', reason: 'Full inventory' },
    ])
  })

  it('costs nothing for a heavy thing passed or not rolled yet, nor for an extra heavy one with no pass', () => {
    const { check: _unrolled, ...unrolled } = anvil
    expect(lubecGearModifiers(gearOf([{ ...anvil, check: 'pass' }, unrolled, { ...anchor, check: 'fail' }, { ...anchor, id: 'n', check: undefined }]))).toEqual([])
  })

  it('never counts a carrier, and counts worn heavy armor', () => {
    const chest = { id: 'chest', name: 'Bedroom chest', type: 'chest', pockets: [{ name: 'Inside', slots: 24, max: 8 }] }
    const carried = { ...gearOf([{ ...anvil, carrier: 'chest' }, { ...buster, carrier: 'chest', slot: undefined, pocket: 0 }]), carriers: [chest] }
    expect(lubecGearModifiers(carried)).toEqual([])
    const suit = T('s', 'worn', null, 'Diving suit', { kind: 'armor', weight: 'heavy', check: 'fail', locs: ['torso'] })
    expect(lubecGearModifiers(gearOf([suit])).map((loss) => loss.key)).toEqual(['heavy:s'])
  })

  it('counts nothing for a thing whose place cannot be read', () => {
    expect(lubecGearModifiers(gearOf([{ ...anvil, carrier: 'hands', slot: undefined }]))).toEqual([])
  })

  it('adds the full inventory after the things on you', () => {
    const full = FULL.map((i) => (i.id === 'h1' ? { ...anvil, carrier: 'hands', slot: 0, pocket: undefined } : i)).filter((i) => i.id !== 'h2')
    expect(lubecGearModifiers(gearOf(full)).map((loss) => loss.key)).toEqual(['heavy:a', 'full'])
  })
})

describe('lubecSheetModifiers', () => {
  it('lists the effects first and gear after', () => {
    const sheet = lubecCharacterSheet({ effects: [sprain], gear: gearOf([anvil]) })
    expect(lubecSheetModifiers(sheet)).toEqual([{ target: 'Speed', amount: -10 }, expect.objectContaining({ key: 'heavy:a', amount: -20 })])
  })

  it('lowers Speed by a failed heavy anvil, and nothing else', () => {
    expect(speed(gearOf([]))).toBe(56)
    expect(speed(gearOf([anvil]))).toBe(36)
    expect(speed(gearOf([anvil]), [sprain])).toBe(26)
    const sheet = lubecCharacterSheet({ gear: gearOf([anvil]) })
    expect(lubecCurrentValue(sheet, 'Strength', lubecSheetModifiers(sheet))).toBe(29)
  })

  it('leaves out a switched-off loss', () => {
    expect(speed(gearOf([anvil], ['heavy:a']))).toBe(56)
    expect(speed(gearOf([anvil, buster], ['huge:b']))).toBe(36)
  })
})

describe('lubecSwitchGearLoss and lubecPrunedOverrides', () => {
  it('switches a loss off and on by its key', () => {
    const off = lubecSwitchGearLoss(gearOf([anvil]), 'heavy:a', false)
    expect(off.overrides).toEqual(['heavy:a'])
    expect(lubecSwitchGearLoss(off, 'heavy:a', false).overrides).toEqual(['heavy:a'])
    expect(lubecSwitchGearLoss(off, 'heavy:a', true).overrides).toEqual([])
  })

  it('prunes a key once the thing it names stops being true, and keeps a live one', () => {
    const gear = gearOf([anvil, { ...buster, id: 'c', carrier: 'backpack', pocket: 0, slot: undefined, size: 4 }], ['heavy:a', 'huge:b', 'full', 'extra:gone'])
    expect(lubecPrunedOverrides(gear).overrides).toEqual(['heavy:a'])
    expect(lubecPrunedOverrides({ ...gear, items: [{ ...anvil, check: undefined }] }).overrides).toEqual([])
    expect(lubecPrunedOverrides({ ...gear, items: [{ ...anvil, carrier: 'hands', slot: 0, pocket: undefined }] }).overrides).toEqual(['heavy:a'])
  })

  it('gives back the same gear when nothing is stale', () => {
    const gear = gearOf([anvil], ['heavy:a'])
    expect(lubecPrunedOverrides(gear)).toBe(gear)
  })
})
