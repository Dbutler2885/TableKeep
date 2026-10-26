/**
 * Armor on one part (Rule A2), against the prototype's sample: the hockey
 * helmet, and the leather work gloves under mittens.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecItem } from './gearRecord'
import { lubecArmorAt } from './armorAt'

const armor = (id: string, name: string, locs: string[], numbers: LubecItem['armor'], extra: Partial<LubecItem> = {}) =>
  ({ id, kind: 'armor', carrier: 'worn', name, size: 1, qty: 1, weight: 'normal', note: '', locs, armor: numbers, ...extra })

const helmet = armor('i13', 'Hockey helmet', ['head'], { cut: 1, pierce: 1, blunt: 2, gun: 0 }, { size: 2 })
const gloves = armor('i12', 'Leather work gloves', ['hand-L', 'hand-R'], { cut: 1, pierce: 0, blunt: 1, gun: 0 })
const mittens = armor('i40', 'Mittens', ['hand-L'], { cut: 0, pierce: 0, blunt: 1, gun: 0 })

describe('armor on one part (Rule A2)', () => {
  it('reads each kind of wound from the one piece on a part', () => {
    const gear = parseLubecGear({ items: [helmet] })
    expect(['cut', 'pierce', 'blunt', 'gun'].map((w) => lubecArmorAt(gear, 'head', w as 'cut'))).toEqual([1, 1, 2, 0])
  })

  it('adds up the four kinds across the pieces on one part, and only that part', () => {
    const gear = parseLubecGear({ items: [gloves, mittens] })
    expect(lubecArmorAt(gear, 'hand-L', 'cut')).toBe(1)
    expect(lubecArmorAt(gear, 'hand-L', 'blunt')).toBe(2)
    expect(lubecArmorAt(gear, 'hand-R', 'blunt')).toBe(1)
    expect(lubecArmorAt(gear, 'hand-L', 'gun')).toBe(0)
  })

  it('reads 0 on a part with nothing worn, and for armor kept somewhere else', () => {
    const gear = parseLubecGear({ items: [{ ...helmet, carrier: 'backpack', pocket: 0 }] })
    expect(lubecArmorAt(gear, 'head', 'blunt')).toBe(0)
    expect(lubecArmorAt(parseLubecGear({ items: [helmet] }), 'neck', 'blunt')).toBe(0)
    expect(lubecArmorAt(parseLubecGear(undefined), 'torso', 'gun')).toBe(0)
  })

  it('reads a worn piece with no numbers as 0', () => {
    const gear = parseLubecGear({ items: [{ ...helmet, armor: undefined }] })
    expect(lubecArmorAt(gear, 'head', 'cut')).toBe(0)
  })
})
