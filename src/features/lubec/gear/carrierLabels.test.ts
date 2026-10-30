/** The Carriers view's words and boxes, as B's `meter`, `pocketsText`, `renderDetail` and `destinationOptions` write them. */
import { describe, expect, it } from 'vitest'
import { emptyLubecGear, LUBEC_BACKPACK_POCKETS, type LubecCarrier, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import {
  lubecCarrierAddedToast,
  lubecCarrierDestinations,
  lubecCarrierUse,
  lubecCarrierWhere,
  lubecCarryingToast,
  lubecDetailCountRest,
  lubecMeterCells,
  lubecPlentyOfRoom,
  lubecPocketCountRest,
  lubecPocketHasRoom,
  lubecPocketsText,
} from './carrierLabels'

const pocket = (name: string, slots: number, max: number) => ({ name, slots, max })
const bag: LubecCarrier = { id: 'bag', name: 'School bag', type: 'school-bag', pockets: [pocket('Main', 4, 4), pocket('Outside pocket', 1, 1)] }
const car: LubecCarrier = { id: 'car', name: 'Family car', type: 'car', pockets: [pocket('Trunk and back seat', 200, 8), pocket('Glove box', 2, 1)] }
const item = (id: string, carrier: string, pocket: number | null, size: LubecItem['size'], weight: LubecItem['weight'] = 'normal'): LubecItem =>
  ({ id, kind: 'thing', name: id, note: '', size, weight, qty: 1, carrier, pocket })

const gear: LubecGear = {
  ...emptyLubecGear(),
  carriers: [bag, car],
  items: [item('rope', 'bag', 0, 2), item('anvil', 'bag', 0, 1, 'heavy'), item('map', 'bag', null, 0), item('crate', 'car', 1, 1), item('cap', 'backpack', 0, 1)],
}

describe('the meter', () => {
  it('draws a box a slot, filled for what is in it, rust for heavy, with a gap between pockets', () => {
    expect(lubecMeterCells(gear, bag)).toEqual(['on', 'on', 'heavy', 'off', 'gap', 'off'])
    expect(lubecMeterCells(gear, { id: 'backpack', pockets: LUBEC_BACKPACK_POCKETS })).toEqual(['on', 'off', 'off', 'off', 'off', 'gap', 'off', 'gap', 'off'])
  })

  it('has "plenty of room" over 24 slots instead (Rule C4)', () => {
    expect(lubecMeterCells(gear, car)).toBeNull()
    expect([lubecPlentyOfRoom(bag.pockets), lubecPlentyOfRoom(car.pockets)]).toEqual([false, true])
  })
})

describe('the carrier words', () => {
  it('list the pockets and count what is used', () => {
    expect(lubecPocketsText(bag.pockets)).toBe('Main 4 (up to 4); Outside pocket 1 (up to 1)')
    expect(lubecCarrierUse(gear, bag)).toEqual({ used: 3, capacity: 5 })
    expect([lubecDetailCountRest(gear, bag), lubecDetailCountRest(gear, car)]).toEqual([' / 2 free', ' / plenty of room'])
    expect([lubecPocketCountRest(bag.pockets[0]), lubecPocketCountRest(bag.pockets[1])]).toEqual([' of 4 / things up to 4 slots', ' of 1 / things up to 1 slot'])
  })

  it('offer "+ Put something in" while a pocket has room', () => {
    const full = { ...gear, items: [...gear.items, item('lamp', 'bag', 0, 1)] }
    expect([lubecPocketHasRoom(gear, bag, 0), lubecPocketHasRoom(full, bag, 0), lubecPocketHasRoom(full, bag, 1)]).toEqual([true, false, true])
  })

  it('offer each carrier, or each of its pockets, in the Move list and "Put it"', () => {
    const duffel: LubecCarrier = { id: 'duffel', name: 'Duffel bag', type: 'duffel', pockets: [pocket('Main', 8, 8)] }
    expect(lubecCarrierDestinations({ ...gear, carriers: [duffel, bag, car] })).toEqual([
      { value: 'duffel#0', label: 'Duffel bag (8 free)' },
      { value: 'bag#0', label: 'School bag: main (1 free)' },
      { value: 'bag#1', label: 'School bag: outside pocket (1 free)' },
      { value: 'car#0', label: 'Family car: trunk and back seat (plenty of room)' },
      { value: 'car#1', label: 'Family car: glove box (1 free)' },
    ])
  })

  it('say where a thing in a carrier is, and confirm an add and a carry', () => {
    expect([lubecCarrierWhere(bag, 1), lubecCarrierWhere(bag, null), lubecCarrierWhere({ ...bag, pockets: [bag.pockets[0]] }, 0)])
      .toEqual(['School bag, outside pocket', 'School bag, small stuff', 'School bag'])
    expect([lubecCarrierAddedToast(bag), lubecCarryingToast(bag)]).toEqual(['School bag added to your carriers.', 'Carrying School bag.'])
  })
})
