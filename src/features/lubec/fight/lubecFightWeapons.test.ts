import { describe, expect, it } from 'vitest'
import { emptyLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_FISTICUFFS_ID } from './lubecFightRequest'
import { lubecChosenWeaponName, lubecFightCells, lubecFightFists, lubecWeaponLine } from './lubecFightWeapons'

const wielder = { strength: 40, handle: 50 }

const held = (id: string, slot: number, extra: Partial<LubecItem> = {}): LubecItem =>
  ({ id, kind: 'thing', carrier: 'hands', slot, name: id, size: 1, qty: 1, weight: 'normal', note: '', ...extra }) as LubecItem

const weapon = (id: string, slot: number, extra: Partial<LubecItem> = {}) => held(id, slot, { kind: 'weapon', mode: 'melee', impact: 1, ...extra })

const gearOf = (...items: LubecItem[]): LubecGear => ({ ...emptyLubecGear(), items })

const cellSummary = (gear: LubecGear) => lubecFightCells(gear, wielder).map((c) => (c.kind === 'held' ? [c.where, c.held.name, c.droppable] : [c.where, 'free']))

describe('lubecWeaponLine', () => {
  it('reads B\'s line: Impact, the minimum Strength and the rounds', () => {
    expect(lubecWeaponLine(weapon('bat', 0, { impact: 1, minStrength: 40 }))).toBe('Impact +1 · min Str 40')
    expect(lubecWeaponLine(weapon('rev', 0, { mode: 'firearm', impact: 3, capacity: 6, loaded: 2 }))).toBe('Impact +3 · 2 of 6 loaded')
    expect(lubecWeaponLine(weapon('rev', 0, { mode: 'firearm', impact: undefined }))).toBe('Impact +0 · 0 of 0 loaded')
    expect(lubecWeaponLine(weapon('dull', 0, { impact: -1 }))).toBe('Impact −1')
  })

  it('calls anything else not a weapon', () => {
    expect(lubecWeaponLine(held('walkie', 0))).toBe('Not a weapon')
  })
})

describe('lubecFightCells', () => {
  it('lists the left hand, then the right, free or holding', () => {
    expect(cellSummary(gearOf(weapon('knife', 1)))).toEqual([['Left hand', 'free'], ['Right hand', 'knife', false]])
    expect(cellSummary(emptyLubecGear())).toEqual([['Left hand', 'free'], ['Right hand', 'free']])
  })

  it('shows one cell for a thing in both hands', () => {
    expect(cellSummary(gearOf(weapon('bat', 0, { size: 2 })))).toEqual([['Both hands', 'bat', true]])
  })

  it('offers each thing a drop once no hand is free', () => {
    expect(cellSummary(gearOf(held('thermos', 0), held('walkie', 1)))).toEqual([['Left hand', 'thermos', true], ['Right hand', 'walkie', true]])
  })

  it('gives a weapon its attack\'s Handle and a thing none', () => {
    const [left, right] = lubecFightCells(gearOf(weapon('knife', 0), held('walkie', 1)), wielder)
    expect(left).toMatchObject({ attack: { total: 50 } })
    expect(right).toMatchObject({ attack: null })
  })
})

describe('lubecFightFists', () => {
  it('needs a free hand', () => {
    expect(lubecFightFists(gearOf(weapon('knife', 0)), wielder)).toMatchObject({ offered: true, attack: { total: 50 } })
    expect(lubecFightFists(gearOf(held('thermos', 0), held('walkie', 1)), wielder)).toEqual({ offered: false })
  })
})

describe('lubecChosenWeaponName', () => {
  it('names a weapon still in hand, and Fisticuffs while a hand is free', () => {
    const gear = gearOf(weapon('knife', 0, { name: 'Knife' }))
    expect(lubecChosenWeaponName(gear, 'knife')).toBe('Knife')
    expect(lubecChosenWeaponName(gear, LUBEC_FISTICUFFS_ID)).toBe('Fisticuffs')
  })

  it('names nothing once it has left the hands, for a thing, or with the hands full', () => {
    const full = gearOf(held('thermos', 0), held('walkie', 1))
    expect(lubecChosenWeaponName(full, 'knife')).toBeNull()
    expect(lubecChosenWeaponName(full, 'thermos')).toBeNull()
    expect(lubecChosenWeaponName(full, LUBEC_FISTICUFFS_ID)).toBeNull()
    expect(lubecChosenWeaponName(full, null)).toBeNull()
  })
})
