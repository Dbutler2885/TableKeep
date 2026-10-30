/**
 * What the hands hold (spec 10.6 and 12.3): left, right and both, the free
 * hands, and Fisticuffs offered only with a free hand.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear } from './gearRecord'
import { lubecFisticuffsHands, lubecFisticuffsOffered, lubecFreeHands, lubecHandsFullOfThings, lubecHeld } from './held'

const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'thing', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra })

const revolver = inHand('i8', "Grandpa's revolver", 0, { kind: 'weapon', mode: 'firearm', capacity: 6, loaded: 0 })
const walkie = inHand('i9', 'Walkie-talkie', 1)
const bat = inHand('bat', 'Baseball bat', 0, { kind: 'weapon', mode: 'melee', size: 2 })
const gearOf = (...items: Record<string, unknown>[]) => parseLubecGear({ items })

describe('what the hands hold', () => {
  it('reads slot 0 as the left hand and slot 1 as the right, left first', () => {
    expect(lubecHeld(gearOf(walkie, revolver))).toEqual([
      { itemId: 'i8', name: "Grandpa's revolver", hands: 'left', weapon: true, loaded: { now: 0, capacity: 6 } },
      { itemId: 'i9', name: 'Walkie-talkie', hands: 'right', weapon: false },
    ])
  })

  it('holds a thing in both hands when Rule W3 says so: over 1 slot, heavy, or two-handed', () => {
    expect(lubecHeld(gearOf(bat)).map((h) => [h.name, h.hands])).toEqual([['Baseball bat', 'both']])
    expect(lubecHeld(gearOf(inHand('a', 'Small anvil', 0, { weight: 'heavy' })))[0].hands).toBe('both')
    expect(lubecHeld(gearOf(inHand('s', 'Slingshot', 1, { kind: 'weapon', hands: 2 })))[0].hands).toBe('both')
  })

  it('gives rounds only to a firearm, and reads missing rounds as 0', () => {
    const melee = lubecHeld(gearOf(inHand('k', 'Knife', 0, { kind: 'weapon', mode: 'melee' })))[0]
    expect(melee).toEqual({ itemId: 'k', name: 'Knife', hands: 'left', weapon: true })
    expect(lubecHeld(gearOf(inHand('g', 'Pistol', 0, { kind: 'weapon', mode: 'firearm' })))[0].loaded).toEqual({ now: 0, capacity: 0 })
  })

  it('lists nothing kept elsewhere, and nothing in hand with no readable slot', () => {
    const elsewhere = { ...walkie, carrier: 'body' }
    const lost = { ...walkie, id: 'x', slot: undefined }
    expect(lubecHeld(gearOf(elsewhere, lost))).toEqual([])
  })
})

describe('free hands', () => {
  it('counts 2, 1 and 0, and a both-hands thing fills both', () => {
    expect(lubecFreeHands(gearOf())).toBe(2)
    expect(lubecFreeHands(gearOf(walkie))).toBe(1)
    expect(lubecFreeHands(gearOf(walkie, revolver))).toBe(0)
    expect(lubecFreeHands(gearOf(bat))).toBe(0)
  })
})

describe('Fisticuffs', () => {
  it('is offered only with a free hand', () => {
    expect(lubecFisticuffsOffered(gearOf())).toBe(true)
    expect(lubecFisticuffsOffered(gearOf(revolver))).toBe(true)
    expect(lubecFisticuffsOffered(gearOf(revolver, walkie))).toBe(false)
    expect(lubecFisticuffsOffered(gearOf(bat))).toBe(false)
  })

  it('fights with both hands while both are free, else with the free one', () => {
    expect(lubecFisticuffsHands(gearOf())).toBe('both')
    expect(lubecFisticuffsHands(gearOf(revolver))).toBe('right')
    expect(lubecFisticuffsHands(gearOf(walkie))).toBe('left')
    expect(lubecFisticuffsHands(gearOf(bat))).toBeNull()
  })

  it('leaves nothing to fight with only when both hands are full of things that are not weapons', () => {
    expect(lubecHandsFullOfThings(gearOf(walkie, { ...revolver, kind: 'thing', name: 'Thermos' }))).toBe(true)
    expect(lubecHandsFullOfThings(gearOf(inHand('a', 'Small anvil', 0, { weight: 'heavy' })))).toBe(true)
    expect(lubecHandsFullOfThings(gearOf(walkie, revolver))).toBe(false)
    expect(lubecHandsFullOfThings(gearOf(bat))).toBe(false)
    expect(lubecHandsFullOfThings(gearOf(walkie))).toBe(false)
  })
})
