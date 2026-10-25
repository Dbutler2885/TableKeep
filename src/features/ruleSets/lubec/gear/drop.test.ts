/**
 * The drop plan (Rules M4 and M8): the item as it is written to the GM's Items
 * tab, where it came from, what it costs, and the gear without it. It writes
 * nothing.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear } from './gearRecord'
import { LUBEC_PLACE_FIELDS, lubecDropPlan } from './drop'

const flashlight = {
  id: 'item-flashlight', kind: 'holder', carrier: 'backpack', pocket: 0, cells: [2], name: 'Flashlight', size: 1, qty: 1, weight: 'normal',
  art: 'flashlight', shape: 'tall', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2,
  note: 'Eveready, two D batteries. Flickers when it gets cold.', engraved: 'W.G.',
}
const anvil = {
  id: 'item-anvil', kind: 'thing', carrier: 'hands', slot: 0, name: 'Small anvil', size: 1, qty: 1, weight: 'heavy', check: 'fail', batch: 'b9',
  note: 'Borrowed from the shop without asking. Dad will notice by Saturday.',
}
const watch = { id: 'item-watch', kind: 'thing', carrier: 'body', slot: 1, name: 'Timex watch', size: 0, qty: 1, weight: 'normal', note: '' }
const gloves = {
  id: 'item-gloves', kind: 'armor', carrier: 'worn', name: 'Leather work gloves', size: 1, qty: 1, weight: 'normal',
  armor: { cut: 1, pierce: 0, blunt: 1, gun: 0 }, locs: ['hand-L', 'hand-R'], note: 'Cannery gloves, stiff with salt.',
}
const sleepingBag = { id: 'item-sleeping-bag', kind: 'thing', carrier: 'chest', pocket: 0, name: 'Sleeping bag', size: 2, qty: 1, weight: 'normal', note: '' }
const chest = { id: 'chest', name: 'Bedroom chest', type: 'chest', pockets: [{ name: 'Chest', slots: 12, max: 8 }] }

const gear = () => parseLubecGear({
  items: [flashlight, anvil, watch, gloves, sleepingBag],
  carriers: [chest],
  overrides: ['heavy:item-anvil'],
  supplies: [],
  backpackArt: 'teal',
})

describe('the drop plan', () => {
  it('clears the place fields and keeps the item\'s other fields', () => {
    const plan = lubecDropPlan(gear(), 'item-flashlight')
    expect(plan?.item).toEqual({
      id: 'item-flashlight', kind: 'holder', name: 'Flashlight', size: 1, qty: 1, weight: 'normal',
      art: 'flashlight', shape: 'tall', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2,
      note: 'Eveready, two D batteries. Flickers when it gets cold.', engraved: 'W.G.',
    })
  })

  it('clears every place field, the batch and the recorded Strength roll among them', () => {
    const dropped = lubecDropPlan(gear(), 'item-anvil')?.item ?? {}
    expect(LUBEC_PLACE_FIELDS).toEqual(['carrier', 'pocket', 'slot', 'cells', 'batch', 'check'])
    for (const field of LUBEC_PLACE_FIELDS) expect(dropped).not.toHaveProperty(field)
    expect(dropped).toMatchObject({ id: 'item-anvil', name: 'Small anvil', weight: 'heavy', note: anvil.note })
  })

  it('says where it came from', () => {
    expect(lubecDropPlan(gear(), 'item-flashlight')).toMatchObject({ from: { carrier: 'backpack', pocket: 0, cells: [2] }, droppedFrom: 'backpack' })
    expect(lubecDropPlan(gear(), 'item-anvil')).toMatchObject({ from: { carrier: 'hands', slot: 0 }, droppedFrom: 'hands' })
    expect(lubecDropPlan(gear(), 'item-gloves')).toMatchObject({ from: { carrier: 'worn' }, droppedFrom: 'worn' })
    expect(lubecDropPlan(gear(), 'item-sleeping-bag')).toMatchObject({ from: { carrier: 'chest', pocket: 0 }, droppedFrom: 'Bedroom chest' })
  })

  it('costs what Rule M4 says, and nothing counted from a carrier (Rule M6)', () => {
    const cost = (id: string) => lubecDropPlan(gear(), id)?.cost
    expect([cost('item-anvil'), cost('item-watch'), cost('item-flashlight'), cost('item-gloves')]).toEqual([0, 0, 2, 1])
    expect(cost('item-sleeping-bag')).toBeNull()
  })

  it('gives the gear without the item, and leaves the gear it was given alone', () => {
    const before = gear()
    const plan = lubecDropPlan(before, 'item-watch')
    expect(plan?.gear.items.map((i) => i.id)).toEqual(['item-flashlight', 'item-anvil', 'item-gloves', 'item-sleeping-bag'])
    expect(plan?.gear).toMatchObject({ carriers: before.carriers, overrides: ['heavy:item-anvil'], backpackArt: 'teal' })
    expect(before.items).toHaveLength(5)
  })

  it('names a carrier it cannot find by its id', () => {
    const lost = parseLubecGear({ items: [{ ...sleepingBag, carrier: 'gone' }] })
    expect(lubecDropPlan(lost, 'item-sleeping-bag')).toMatchObject({ droppedFrom: 'gone', cost: null })
  })

  it('plans nothing for an item the gear does not hold', () => {
    expect(lubecDropPlan(gear(), 'item-missing')).toBeNull()
  })
})
