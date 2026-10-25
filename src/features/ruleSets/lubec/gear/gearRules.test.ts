/**
 * The game's numbers and the armor locations, as the prototype has them.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecItem } from './gearRecord'
import {
  baseLoc,
  BODY_REGIONS,
  HOLD,
  holds,
  holdWay,
  isBox,
  KIND_NAMES,
  LOC_KEYS,
  LOCATIONS,
  locName,
  locSummary,
  RULES,
  SIZE_NAMES,
} from './gearRules'

const item = (fields: Record<string, unknown>) => parseLubecItem({ name: 'Thing', carrier: 'backpack', pocket: 0, ...fields }, 'item-1')

describe('the rules settings', () => {
  it('keeps B\'s Speed and Handle numbers', () => {
    expect(RULES).toMatchObject({ heavyFail: 20, extraPass: 20, encumbering: 20, fullInventory: 10, handArmorHandle: 10 })
  })

  it('gives every location a layer limit (Rule A1)', () => {
    expect(Object.keys(RULES.layers)).toEqual(LOCATIONS.map((l) => l.id))
    expect(RULES.layers.torso).toBe(3)
    expect(RULES.layers.hand).toBe(2)
  })
})

describe('the armor locations', () => {
  it('has 17 location keys, a left and a right of each paired part', () => {
    expect(LOC_KEYS).toHaveLength(17)
    expect(LOC_KEYS.slice(0, 5)).toEqual(['head', 'neck', 'torso', 'upperarm-L', 'upperarm-R'])
  })

  it('draws one body region per location key', () => {
    expect(Object.keys(BODY_REGIONS).sort()).toEqual([...LOC_KEYS].sort())
  })

  it('names a key, and its part', () => {
    expect(baseLoc('hand-L')).toBe('hand')
    expect(baseLoc('torso')).toBe('torso')
    expect(locName('hand-L')).toBe('Left hand')
    expect(locName('upperarm-R')).toBe('Right upper arm')
    expect(locName('torso')).toBe('Torso')
    expect(locName('tail')).toBe('tail')
  })

  it('sums up what a piece covers, with both sides of a pair as the plural', () => {
    expect(locSummary(['hand-L', 'hand-R'])).toBe('Hands')
    expect(locSummary(['torso', 'upperarm-L', 'upperarm-R', 'feet-R'])).toBe('Torso, Upper arms, Right foot')
    expect(locSummary(['shin-L'])).toBe('Left shin')
    expect(locSummary([])).toBe('')
  })
})

describe('sizes and kinds', () => {
  it('names the sizes (Rule S1) and the kinds', () => {
    expect(SIZE_NAMES).toEqual({ 0: 'Small', 1: 'Normal', 2: 'Bulky', 4: 'Large', 8: 'Huge' })
    expect(Object.values(KIND_NAMES)).toEqual(['Thing', 'Weapon', 'Armor', 'Consumable', 'Holder'])
  })

  it('gives each way a holder holds its own words (Rule K5)', () => {
    expect(HOLD.load.put).toBe('Load')
    expect(HOLD.fill).toEqual({ name: 'Filled', like: 'like a canteen', fact: 'In it', put: 'Fill up', out: 'Empty' })
    expect(HOLD.box.out).toBe('Take some out')
  })

  it('tells what holds a supply, and how', () => {
    const revolver = item({ kind: 'weapon', mode: 'firearm', takes: 'a38', capacity: 6, loaded: 0 })
    const canteen = item({ kind: 'holder', hold: 'fill', takes: 'water', capacity: 1, loaded: 1 })
    const box = item({ kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 20 })
    const unset = item({ kind: 'holder', takes: 'dcell', capacity: 2 })
    expect([revolver, canteen, box].every(holds)).toBe(true)
    expect(holds(item({}))).toBe(false)
    expect(holds(null)).toBe(false)
    expect([revolver, canteen, box, unset].map(holdWay)).toEqual(['load', 'fill', 'box', 'load'])
    expect([revolver, canteen, box].map(isBox)).toEqual([false, false, true])
  })
})
