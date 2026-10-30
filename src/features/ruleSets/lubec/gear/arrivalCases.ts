// Where an arriving item lands, recorded as one table of cases. They hold for
// both the app copy of the arrival rule (`arrival.ts`) and the Cloud Functions
// copy the transfer callable uses (`functions/src/lubecGearTransfer.ts`);
// `lubecGearTransfer.function.test.ts` runs them against both, and against the
// compiled copy that is deployed. Every case is written as stored, with every
// field the app's reader models, so the two copies read the same thing.

import { LUBEC_NO_ROOM_TO_ACCEPT } from './arrival'

type Fields = Record<string, unknown>

/** A stored gear field with the four lists the sheet keeps. */
export type StoredGear = Fields & { items: Fields[]; carriers: Fields[]; overrides: string[]; supplies: Fields[] }

export type ArrivalCase = {
  name: string
  gear: StoredGear
  item: Fields
  /** The sender's made supplies. */
  offered: Fields[]
  /** Where the item lands and the receiver's supplies after it, or the refusal. */
  expected: { ok: true; item: Fields; supplies: Fields[] } | { ok: false; msg: string }
}

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Fields = {}): Fields => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

export const gearOf = (items: Fields[], supplies: Fields[] = [], extra: Fields = {}): StoredGear =>
  ({ items, carriers: [], overrides: [], supplies, ...extra })

// What the sender's sheet held: placed, stacked, with a recorded roll.
const sent = (size: number, extra: Fields = {}): Fields =>
  ({ ...T('gift', 'chest', 2, 'Gift', size), batch: 'b4', cells: [1], check: 'fail', ...extra })

/** The sent item as it arrives at `at`: the sender's place, batch and roll gone. */
const arrived = (size: number, at: Fields, extra: Fields = {}): Fields =>
  ({ id: 'gift', kind: 'thing', name: 'Gift', size, qty: 1, weight: 'normal', note: '', ...extra, ...at })

const mainFull = [T('tent', 'backpack', 0, 'Tent', 4), T('cup', 'backpack', 0, 'Cup', 1)]
const backpackFull = [...mainFull, T('map', 'backpack', 1, 'Map', 1), T('pen', 'backpack', 2, 'Pen', 1)]
const noRoom = { ok: false as const, msg: LUBEC_NO_ROOM_TO_ACCEPT }

const slugs = { id: 'slug', name: 'Slingshot slugs', loose: [0, 20] }
const water = { id: 'water', name: 'Water', loose: null }
const sling = (extra: Fields = {}) => sent(1, { kind: 'weapon', takes: 'slug', capacity: 1, ...extra })

export const arrivalCases: ArrivalCase[] = [
  {
    name: 'a 1-slot thing lands in the main pocket of an empty backpack',
    gear: gearOf([]), item: sent(1), offered: [],
    expected: { ok: true, item: arrived(1, { carrier: 'backpack', pocket: 0 }), supplies: [] },
  },
  {
    name: 'a 4-slot thing fills the main pocket',
    gear: gearOf([]), item: sent(4), offered: [],
    expected: { ok: true, item: arrived(4, { carrier: 'backpack', pocket: 0 }), supplies: [] },
  },
  {
    name: 'a 2-slot thing takes the main pocket\'s last two slots',
    gear: gearOf([T('pot', 'backpack', 0, 'Pot', 2), T('cup', 'backpack', 0, 'Cup', 1)]), item: sent(2), offered: [],
    expected: { ok: true, item: arrived(2, { carrier: 'backpack', pocket: 0 }), supplies: [] },
  },
  {
    name: 'with the main pocket full, a 1-slot thing goes to the left front pocket',
    gear: gearOf(mainFull), item: sent(1), offered: [],
    expected: { ok: true, item: arrived(1, { carrier: 'backpack', pocket: 1 }), supplies: [] },
  },
  {
    name: 'with the left front pocket full too, it goes to the right',
    gear: gearOf([...mainFull, T('map', 'backpack', 1, 'Map', 1)]), item: sent(1), offered: [],
    expected: { ok: true, item: arrived(1, { carrier: 'backpack', pocket: 2 }), supplies: [] },
  },
  {
    name: 'a full backpack refuses a 1-slot thing, even with empty hands',
    gear: gearOf(backpackFull), item: sent(1), offered: [], expected: noRoom,
  },
  {
    name: 'a 2-slot thing is refused when only the front pockets have room',
    gear: gearOf(mainFull), item: sent(2), offered: [], expected: noRoom,
  },
  {
    name: 'small stuff goes in the backpack in no pocket, however full it is',
    gear: gearOf(backpackFull), item: sent(0), offered: [],
    expected: { ok: true, item: arrived(0, { carrier: 'backpack', pocket: null }), supplies: [] },
  },
  {
    name: 'a heavy 1-slot thing lands in the backpack, and arrives with no Strength roll',
    gear: gearOf([]), item: sent(1, { weight: 'heavy' }), offered: [],
    expected: { ok: true, item: arrived(1, { carrier: 'backpack', pocket: 0 }, { weight: 'heavy' }), supplies: [] },
  },
  {
    name: 'a stored size it cannot read counts as 1 slot',
    gear: gearOf([T('tent', 'backpack', 0, 'Tent', 4), T('odd', 'backpack', 0, 'Odd', 3)]), item: sent(1), offered: [],
    expected: { ok: true, item: arrived(1, { carrier: 'backpack', pocket: 1 }), supplies: [] },
  },
  {
    name: 'things in hands, on the body and in a carrier take no backpack room',
    gear: gearOf([T('torch', 'hands', 0, 'Torch', 1), T('cap', 'body', 0, 'Cap', 1), T('rope', 'strap', 0, 'Rope', 4)]),
    item: sent(4), offered: [],
    expected: { ok: true, item: arrived(4, { carrier: 'backpack', pocket: 0 }), supplies: [] },
  },
  {
    name: 'an 8-slot thing goes into two empty hands',
    gear: gearOf(backpackFull), item: sent(8), offered: [],
    expected: { ok: true, item: arrived(8, { carrier: 'hands', slot: 0 }), supplies: [] },
  },
  {
    name: 'an 8-slot thing is refused with one hand full',
    gear: gearOf([T('torch', 'hands', 1, 'Torch', 1)]), item: sent(8), offered: [], expected: noRoom,
  },
  {
    name: 'an 8-slot thing is refused while a heavy thing fills both hands',
    gear: gearOf([T('anvil', 'hands', 0, 'Anvil', 1, { weight: 'extra' })]), item: sent(8), offered: [], expected: noRoom,
  },
  {
    name: 'an 8-slot thing is refused while a two-handed thing is held',
    gear: gearOf([T('sling', 'hands', 0, 'Slingshot', 1, { hands: 2 })]), item: sent(8), offered: [], expected: noRoom,
  },
  {
    name: 'a thing in hand with no readable slot fills neither hand',
    gear: gearOf([{ ...T('torch', 'hands', 0, 'Torch', 1), slot: 'left' }]), item: sent(8), offered: [],
    expected: { ok: true, item: arrived(8, { carrier: 'hands', slot: 0 }), supplies: [] },
  },
  {
    name: 'the sender\'s place, stack and roll go; the id, quantity and every other field stay',
    gear: gearOf([]), item: sent(1, { weight: 'heavy', qty: 3, engraved: 'W.G.' }), offered: [],
    expected: { ok: true, item: arrived(1, { carrier: 'backpack', pocket: 0 }, { weight: 'heavy', qty: 3, engraved: 'W.G.' }), supplies: [] },
  },
  {
    name: 'a made supply the item takes comes along when the receiver lacks it',
    gear: gearOf([], [water]), item: sling(), offered: [slugs, { id: 'other', name: 'Other', loose: null }],
    expected: {
      ok: true,
      item: arrived(1, { carrier: 'backpack', pocket: 0 }, { kind: 'weapon', takes: 'slug', capacity: 1 }),
      supplies: [water, slugs],
    },
  },
  {
    name: 'a made supply the item is comes along, but not twice',
    gear: gearOf([], [slugs]), item: sent(1, { kind: 'consumable', fits: 'slug' }), offered: [slugs],
    expected: { ok: true, item: arrived(1, { carrier: 'backpack', pocket: 0 }, { kind: 'consumable', fits: 'slug' }), supplies: [slugs] },
  },
  {
    name: 'a supply the sender did not make is not invented',
    gear: gearOf([]), item: sling(), offered: [],
    expected: { ok: true, item: arrived(1, { carrier: 'backpack', pocket: 0 }, { kind: 'weapon', takes: 'slug', capacity: 1 }), supplies: [] },
  },
]
