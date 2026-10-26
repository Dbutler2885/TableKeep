/**
 * How the Lubec sheet reads a character's stored gear: an empty record for
 * anything missing or unreadable, a skipped entry for one that is not a
 * record, the null case for a modelled field it cannot read, and every field
 * it does not model kept as stored. The items are B's own sample.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecCharacter, serializeLubecCharacter } from '../characterParser'
import {
  parseLubecCarrierRecord,
  emptyLubecGear,
  LUBEC_DEFAULT_BACKPACK_ART,
  lubecBackpackArt,
  lubecItemsNeedingAPlace,
  parseLubecGear,
  parseLubecItem,
  type LubecGear,
} from './gearRecord'

const flashlight = {
  id: 'item-flashlight', kind: 'holder', carrier: 'backpack', pocket: 0, name: 'Flashlight', size: 1, qty: 1, weight: 'normal',
  art: 'flashlight', shape: 'tall', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2,
  note: 'Eveready, two D batteries. Flickers when it gets cold.',
}
const anvil = {
  id: 'item-anvil', kind: 'thing', carrier: 'backpack', pocket: 0, name: 'Small anvil', size: 1, qty: 1, weight: 'heavy', check: 'fail',
  note: 'Borrowed from the shop without asking. Dad will notice by Saturday.',
}
const marbles = { id: 'item-marbles', kind: 'thing', carrier: 'backpack', pocket: null, name: 'Marbles', size: 0, qty: 12, weight: 'normal', note: '' }
const revolver = {
  id: 'item-revolver', kind: 'weapon', carrier: 'hands', slot: 0, name: "Grandpa's revolver", size: 1, qty: 1, weight: 'normal',
  art: 'revolver', shape: 'wide', mode: 'firearm', impact: 1, table: 'gunshot', wounds: ['gun'], capacity: 6, loaded: 0, takes: 'a38',
  note: 'Kept unloaded in the sideboard drawer. The shells are in a separate box.',
}
const gloves = {
  id: 'item-gloves', kind: 'armor', carrier: 'worn', name: 'Leather work gloves', size: 1, qty: 1, weight: 'normal',
  art: 'gloves', shape: 'square', armor: { cut: 1, pierce: 0, blunt: 1, gun: 0 }, locs: ['hand-L', 'hand-R'],
  note: 'Cannery gloves, stiff with salt.',
}
const sleepingBag = { id: 'item-sleeping-bag', kind: 'thing', carrier: 'chest', pocket: 0, name: 'Sleeping bag', size: 2, qty: 1, weight: 'normal', note: '' }
const chest = { id: 'chest', name: 'Bedroom chest', type: 'chest', pockets: [{ name: 'Chest', slots: 12, max: 8 }] }
const d38 = { id: 'a38', name: '.38 rounds' }
const batteries = { id: 'dcell', name: 'D batteries', loose: [1, 4] }

const storedGear = {
  items: [flashlight, anvil, marbles, revolver, gloves, sleepingBag],
  carriers: [chest],
  overrides: ['heavy:item-anvil'],
  supplies: [d38, batteries],
  backpackArt: 'teal',
}

const stored = (gear: unknown) => ({
  system: 'lubec',
  name: 'Wayne Gardner',
  lubec: { class: { key: 'working', choices: {} }, gear },
})

const withPlaces = (...items: Record<string, unknown>[]): LubecGear => parseLubecGear({ carriers: [chest], items })

describe('reading stored gear', () => {
  it('reads B\'s sample as stored', () => {
    expect(parseLubecGear(storedGear)).toEqual(storedGear)
  })

  it('reads a missing gear field, or one that is not a record, as empty', () => {
    const empty = { items: [], carriers: [], overrides: [], supplies: [] }
    expect(emptyLubecGear()).toEqual(empty)
    for (const gear of [undefined, null, 'a backpack', 7, [flashlight]]) {
      expect(parseLubecGear(gear)).toEqual(empty)
    }
  })

  it('reads a list that is not a list as an empty one', () => {
    expect(parseLubecGear({ items: { flashlight }, carriers: 'chest', overrides: 'heavy', supplies: null })).toEqual(emptyLubecGear())
  })

  it('skips an entry that is not a record, and an override that is not text', () => {
    const gear = parseLubecGear({
      items: [flashlight, 'Flashlight', null, [anvil]],
      carriers: [7, chest],
      overrides: ['heavy:item-anvil', 3, null],
      supplies: [d38, 'dcell'],
    })
    expect(gear.items.map((item) => item.name)).toEqual(['Flashlight'])
    expect(gear.carriers.map((carrier) => carrier.id)).toEqual(['chest'])
    expect(gear.overrides).toEqual(['heavy:item-anvil'])
    expect(gear.supplies).toEqual([d38])
  })

  it('keeps every field it does not model, at gear, item, carrier, pocket and supply level', () => {
    const gear = parseLubecGear({
      ...storedGear,
      unknownGearField: { kept: true },
      items: [{ ...flashlight, tags: 'light', unknownItemField: [1, 'two'] }],
      carriers: [{ ...chest, unknownCarrierField: 'kept', pockets: [{ ...chest.pockets[0], unknownPocketField: 4 }] }],
      supplies: [{ ...d38, unknownSupplyField: null }],
    })
    expect(gear.unknownGearField).toEqual({ kept: true })
    expect(gear.items[0]).toMatchObject({ tags: 'light', unknownItemField: [1, 'two'] })
    expect(gear.carriers[0]).toMatchObject({ unknownCarrierField: 'kept', pockets: [{ unknownPocketField: 4 }] })
    expect(gear.supplies[0]).toMatchObject({ unknownSupplyField: null })
  })

  it('reads an item with nothing readable as an unnamed 1-slot thing of normal weight, one of it, in no place', () => {
    expect(parseLubecItem({ kind: 'gadget', name: 7, note: ['?'], size: 3, weight: 'light', qty: -1, carrier: 2 }, 'item-1')).toEqual({
      id: 'item-1', kind: 'thing', name: '', note: '', size: 1, weight: 'normal', qty: 1, carrier: '',
    })
    expect(parseLubecItem('not an item', 'item-9')).toMatchObject({ id: 'item-9', kind: 'thing', name: '' })
  })

  it('reads an unreadable optional field as missing, and keeps the readable ones', () => {
    const item = parseLubecItem({
      ...revolver,
      check: 'maybe',
      slot: -1,
      mode: 'laser',
      impact: 1.5,
      wounds: ['gun', 'burn'],
      armor: { cut: 1 },
      handlePenaltyOverride: null,
      pocket: 'front',
      cells: [0, 1],
      per: 0,
    }, 'item-1')
    for (const field of ['check', 'slot', 'mode', 'impact', 'wounds', 'armor', 'pocket', 'per']) {
      expect(item).not.toHaveProperty(field)
    }
    expect(item).toMatchObject({ handlePenaltyOverride: null, cells: [0, 1], capacity: 6, takes: 'a38', table: 'gunshot' })
  })

  it('names an item, a carrier and a supply stored without an id by its place in the list', () => {
    const gear = parseLubecGear({
      items: [flashlight, { ...anvil, id: undefined }],
      carriers: [{ ...chest, id: '' }],
      supplies: [{ ...d38, id: 7 }],
    })
    expect(gear.items.map((item) => item.id)).toEqual(['item-flashlight', 'item-2'])
    expect(gear.carriers[0].id).toBe('carrier-1')
    expect(gear.supplies[0].id).toBe('supply-1')
  })

  it('reads a carrier\'s and a pocket\'s unreadable fields as their null cases', () => {
    const { carriers } = parseLubecGear({ carriers: [{ id: 'chest', name: 3, type: null, carried: 'yes', pockets: [{ name: 'Chest', slots: '12', max: -8 }, 'Lid'] }] })
    expect(carriers).toEqual([{ id: 'chest', name: '', type: '', pockets: [{ name: 'Chest', slots: 0, max: 0 }] }])
  })

  it('reads a supply\'s loose size only as a pair of counts, or null when it cannot be loose', () => {
    const { supplies } = parseLubecGear({ supplies: [batteries, { id: 'water', name: 'Water', loose: null }, { id: 'oil', name: 'Lamp oil', loose: [1] }] })
    expect(supplies).toEqual([batteries, { id: 'water', name: 'Water', loose: null }, { id: 'oil', name: 'Lamp oil' }])
  })
})

describe('a carrier stored on its own', () => {
  it('reads its pockets and items, with its document id as its id', () => {
    const stored = { id: 'old', name: "Stephen's skiff", type: 'boat', ownerCharacterId: 'stephen', pockets: [{ name: 'Hull', slots: 2, max: 2 }], items: [{ id: 'rope', name: 'Rope', carrier: 'skiff', pocket: 0 }, 'junk'] }

    expect(parseLubecCarrierRecord(stored, 'skiff')).toEqual({
      id: 'skiff', name: "Stephen's skiff", type: 'boat', ownerCharacterId: 'stephen', pockets: [{ name: 'Hull', slots: 2, max: 2 }],
      items: [{ id: 'rope', kind: 'thing', name: 'Rope', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'skiff', pocket: 0 }],
    })
  })

  it('reads anything that is not a record as an empty carrier', () => {
    expect(parseLubecCarrierRecord(null, 'skiff')).toEqual({ id: 'skiff', name: '', type: '', pockets: [], items: [] })
  })
})

describe('items that need a place', () => {
  it('finds none in B\'s sample', () => {
    expect(lubecItemsNeedingAPlace(parseLubecGear(storedGear))).toEqual([])
  })

  it('lists an item in no carrier, or in one the record does not have', () => {
    const gear = withPlaces({ ...anvil, carrier: 'skiff' }, { ...anvil, id: 'nowhere', carrier: undefined }, { ...anvil, id: 'dropped', carrier: 'ground' })
    expect(lubecItemsNeedingAPlace(gear).map((item) => item.id)).toEqual(['item-anvil', 'nowhere', 'dropped'])
  })

  it('lists a hand or body item with no slot or a slot out of range', () => {
    const gear = withPlaces(
      { ...revolver, slot: 1 },
      { ...revolver, id: 'no-slot', slot: undefined },
      { ...revolver, id: 'third-hand', slot: 2 },
      { ...revolver, id: 'body-1', carrier: 'body', slot: 1 },
      { ...revolver, id: 'body-3', carrier: 'body', slot: 3 },
    )
    expect(lubecItemsNeedingAPlace(gear).map((item) => item.id)).toEqual(['no-slot', 'third-hand', 'body-3'])
  })

  it('lists a pocket out of range, and anything but small stuff with no pocket', () => {
    const gear = withPlaces(
      { ...anvil, pocket: 2 },
      { ...anvil, id: 'back-pocket', pocket: 3 },
      { ...anvil, id: 'loose-anvil', pocket: null },
      { ...sleepingBag, pocket: 1 },
      marbles,
      { ...marbles, id: 'marbles-in-front', pocket: 1 },
      { ...marbles, id: 'marbles-in-chest', carrier: 'chest' },
    )
    expect(lubecItemsNeedingAPlace(gear).map((item) => item.id)).toEqual(['back-pocket', 'loose-anvil', 'item-sleeping-bag'])
  })
})

describe('the backpack picture', () => {
  const known = ['navy-stripe', 'teal', 'red-canvas']

  it('is the stored pick when the app knows it', () => {
    expect(lubecBackpackArt(parseLubecGear(storedGear), known)).toBe('teal')
  })

  it('is the default when missing, cleared, unknown or unreadable', () => {
    expect(LUBEC_DEFAULT_BACKPACK_ART).toBe('navy-stripe')
    for (const backpackArt of [undefined, '', 'tartan', 7]) {
      const gear = parseLubecGear({ backpackArt })
      expect(lubecBackpackArt(gear, known)).toBe('navy-stripe')
    }
    expect(parseLubecGear({ backpackArt: 7 })).not.toHaveProperty('backpackArt')
  })

  it('keeps an unknown stored name through a save, for the build that knows it', () => {
    expect(parseLubecGear({ backpackArt: 'tartan' }).backpackArt).toBe('tartan')
  })
})

describe('saving gear with the character', () => {
  it('writes back what it read, unknown fields included', () => {
    const data = stored({ ...storedGear, unknownGearField: 1, items: [{ ...flashlight, unknownItemField: 'kept' }] })
    const record = parseLubecCharacter('pc-1', data)
    const serialized = serializeLubecCharacter(record)
    expect((serialized.lubec as Record<string, unknown>).gear).toEqual(data.lubec.gear)
    expect(parseLubecCharacter('pc-1', serialized)).toEqual(record)
  })

  it('writes a shorter items array when an item is removed', () => {
    const record = parseLubecCharacter('pc-1', stored(storedGear))
    const gear = { ...record.lubec.gear, items: record.lubec.gear.items.filter((item) => item.id !== anvil.id) }
    const serialized = serializeLubecCharacter({ ...record, lubec: { ...record.lubec, gear } })
    const items = ((serialized.lubec as Record<string, unknown>).gear as LubecGear).items
    expect(items).toHaveLength(storedGear.items.length - 1)
    expect(items.map((item) => item.id)).not.toContain(anvil.id)
  })

  it('writes the items, carriers, overrides and supplies as arrays', () => {
    const serialized = serializeLubecCharacter(parseLubecCharacter('pc-1', stored(storedGear)))
    const gear = (serialized.lubec as Record<string, unknown>).gear as Record<string, unknown>
    for (const field of ['items', 'carriers', 'overrides', 'supplies']) {
      expect(Array.isArray(gear[field])).toBe(true)
    }
  })
})
