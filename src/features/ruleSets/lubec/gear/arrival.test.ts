/**
 * Where a given or accepted item lands (spec 11.3): the first backpack pocket
 * that fits, both empty hands for an 8-slot thing, or a refusal. The arrival
 * is cleaned of the sender's place, and a made supply comes along with it.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, parseLubecItem, type LubecGear } from './gearRecord'
import { LUBEC_NO_ROOM_TO_ACCEPT, lubecReceive } from './arrival'

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Record<string, unknown> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

const gearOf = (items: unknown[], supplies: unknown[] = []): LubecGear => parseLubecGear({ items, supplies })

// What the sender's sheet held: placed, stacked, with a recorded roll.
const sent = (size: number, extra: Record<string, unknown> = {}) =>
  parseLubecItem({ ...T('gift', 'chest', 2, 'Gift', size), batch: 'b4', cells: [1], check: 'fail', ...extra }, 'gift')

const landed = (gear: LubecGear, size: number, extra: Record<string, unknown> = {}) => {
  const arrival = lubecReceive(gear, sent(size, extra))
  if (!arrival.ok) throw new Error(arrival.msg)
  return arrival
}

describe('where an arriving item lands', () => {
  it('lands in the first backpack pocket that fits', () => {
    expect(landed(gearOf([]), 1).item).toMatchObject({ carrier: 'backpack', pocket: 0 })
    expect(landed(gearOf([]), 4).item).toMatchObject({ carrier: 'backpack', pocket: 0 })
    // The main pocket is full, so a 1-slot thing goes to the left front pocket, then the right.
    const mainFull = [T('tent', 'backpack', 0, 'Tent', 4), T('cup', 'backpack', 0, 'Cup', 1)]
    expect(landed(gearOf(mainFull), 1).item).toMatchObject({ carrier: 'backpack', pocket: 1 })
    expect(landed(gearOf([...mainFull, T('map', 'backpack', 1, 'Map', 1)]), 1).item).toMatchObject({ carrier: 'backpack', pocket: 2 })
  })

  it('puts small stuff in the backpack in no pocket, however full it is', () => {
    const full = [T('tent', 'backpack', 0, 'Tent', 4), T('cup', 'backpack', 0, 'Cup', 1), T('map', 'backpack', 1, 'Map', 1), T('pen', 'backpack', 2, 'Pen', 1)]
    expect(landed(gearOf(full), 0).item).toMatchObject({ carrier: 'backpack', pocket: null })
  })

  it('puts an 8-slot thing in two empty hands, and refuses it with a hand full', () => {
    expect(landed(gearOf([]), 8).item).toMatchObject({ carrier: 'hands', slot: 0 })
    expect(lubecReceive(gearOf([T('torch', 'hands', 1, 'Torch', 1)]), sent(8))).toEqual({ ok: false, msg: LUBEC_NO_ROOM_TO_ACCEPT })
  })

  it('refuses when the backpack has no pocket for it, even with empty hands', () => {
    const mainFull = [T('tent', 'backpack', 0, 'Tent', 4), T('cup', 'backpack', 0, 'Cup', 1)]

    expect(lubecReceive(gearOf(mainFull), sent(2))).toEqual({ ok: false, msg: LUBEC_NO_ROOM_TO_ACCEPT })
    expect(LUBEC_NO_ROOM_TO_ACCEPT).toBe('Not enough room to accept this item. Make room in your backpack or hands, then accept again.')
  })
})

describe('what arrives', () => {
  it('removes the sender\'s place fields and the Strength roll, and keeps the id, quantity and everything else', () => {
    const arrival = landed(gearOf([]), 1, { weight: 'heavy', qty: 3, engraved: 'W.G.' })

    expect(arrival.item).toEqual({
      id: 'gift', kind: 'thing', name: 'Gift', size: 1, qty: 3, weight: 'heavy', note: '', engraved: 'W.G.', carrier: 'backpack', pocket: 0,
    })
    expect(arrival.gear.items).toEqual([arrival.item])
  })

  it('adds a made supply the item takes or is, when the receiver lacks it', () => {
    const slugs = { id: 'slug', name: 'Slingshot slugs', loose: [0, 20] }
    const own = { id: 'water', name: 'Water', loose: null }
    const gun = parseLubecItem({ ...T('sling', 'hands', 0, 'Slingshot', 1), kind: 'weapon', takes: 'slug', capacity: 1 }, 'sling')

    const arrival = lubecReceive(gearOf([], [own]), gun, [slugs, { id: 'other', name: 'Other' }])
    expect(arrival.ok && arrival.gear.supplies).toEqual([own, slugs])

    const ammo = parseLubecItem({ ...T('box', 'chest', 0, 'Slugs', 1), kind: 'consumable', fits: 'slug' }, 'box')
    const already = lubecReceive(gearOf([], [slugs]), ammo, [slugs])
    expect(already.ok && already.gear.supplies).toEqual([slugs])
  })

  it('leaves the gear it was given as it was', () => {
    const gear = gearOf([T('cup', 'backpack', 0, 'Cup', 1)])
    const before = structuredClone(gear)

    landed(gear, 1)

    expect(gear).toEqual(before)
  })
})
