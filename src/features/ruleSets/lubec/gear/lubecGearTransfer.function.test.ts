import { describe, expect, it } from 'vitest'
import * as serverTransfer from '../../../../../functions/src/lubecGearTransfer'
// The compiled output is tracked and is what gets deployed, so it runs the same
// cases as its source.
import * as compiledServerTransfer from '../../../../../functions/lib/lubecGearTransfer.js'
import { LUBEC_NO_ROOM_TO_ACCEPT, lubecReceive } from './arrival'
import { arrivalCases, gearOf, type ArrivalCase, type StoredGear } from './arrivalCases'
import { parseLubecGear, parseLubecItem } from './gearRecord'

type Fields = Record<string, unknown>

// The app's rule runs on gear as the sheet reads it, so its result is compared with the expected gear read the same way.
const appCopy = {
  read: (gear: StoredGear): Fields => parseLubecGear(gear),
  receive: ({ gear, item, offered }: ArrivalCase) =>
    lubecReceive(parseLubecGear(gear), parseLubecItem(item, 'arriving'), parseLubecGear({ supplies: offered }).supplies),
}

// The callable's copy runs on gear as stored.
const serverCopyOf = (transfer: typeof serverTransfer) => ({
  read: (gear: StoredGear): Fields => gear,
  receive: ({ gear, item, offered }: ArrivalCase) => transfer.lubecReceive(gear, item, offered),
})

const copies = [
  ['app', appCopy],
  ['server', serverCopyOf(serverTransfer)],
  ['compiled server', serverCopyOf(compiledServerTransfer)],
] as const

describe.each(copies)('where an arriving Lubec item lands, %s copy', (_label, copy) => {
  it.each(arrivalCases)('$name', (testCase) => {
    const { expected } = testCase
    const want = expected.ok
      ? { ok: true, item: expected.item, gear: copy.read({ ...testCase.gear, items: [...testCase.gear.items, expected.item], supplies: expected.supplies }) }
      : expected
    expect(copy.receive(testCase)).toEqual(want)
  })

  it('leaves the gear it was given as it was', () => {
    const testCase = arrivalCases[3]
    const before = structuredClone(testCase)

    copy.receive(testCase)

    expect(testCase).toEqual(before)
  })
})

const servers = [['server', serverTransfer], ['compiled server', compiledServerTransfer]] as const

it.each(servers)('the %s copy refuses with the app copy\'s words', (_label, transfer) => {
  expect(transfer.LUBEC_NO_ROOM_TO_ACCEPT).toBe(LUBEC_NO_ROOM_TO_ACCEPT)
})

const item = (id: string, carrier: string, pocket: number, extra: Fields = {}): Fields =>
  ({ id, kind: 'thing', carrier, pocket, name: id, size: 1, qty: 1, weight: 'normal', note: '', ...extra })

const characterWith = (gear: unknown, lubec: Fields = {}): Fields => ({ ownerUserId: 'u', lubec: { counters: { stress: 3 }, ...lubec, gear } })

describe.each(servers)('accepting a Lubec transfer, %s copy', (_label, transfer) => {
  const rope = item('rope', 'strap', 0, { qty: 5, batch: 'b1' })
  const sender = characterWith(gearOf([rope, item('cup', 'backpack', 0)], [{ id: 'slug', name: 'Slugs', loose: null }], { backpackArt: 'navy-stripe' }))
  const receiver = characterWith(gearOf([item('pen', 'backpack', 2)], [], { carriers: [{ id: 'sack', name: 'Sack', type: 'sack', pockets: [] }], overrides: ['speed:1'] }))
  const offer = (snapshot: unknown, itemId = 'rope') => ({ itemId, itemSnapshot: snapshot })

  it('moves the whole item, writing only `lubec.gear` on each side and keeping the rest of each gear record', () => {
    expect(transfer.acceptLubecTransfer(sender, receiver, offer(rope))).toEqual({
      ok: true,
      sender: { lubec: { gear: gearOf([item('cup', 'backpack', 0)], [{ id: 'slug', name: 'Slugs', loose: null }], { backpackArt: 'navy-stripe' }) } },
      receiver: {
        lubec: {
          gear: gearOf(
            [item('pen', 'backpack', 2), item('rope', 'backpack', 0, { qty: 5 })],
            [],
            { carriers: [{ id: 'sack', name: 'Sack', type: 'sack', pockets: [] }], overrides: ['speed:1'] },
          ),
        },
      },
    })
  })

  it('moves part of a stack under the offered id and quantity, and the sender keeps the rest', () => {
    const outcome = transfer.acceptLubecTransfer(sender, receiver, offer({ ...rope, id: 'split', qty: 2 }))

    expect(outcome.ok && outcome.sender).toEqual({
      lubec: { gear: gearOf([{ ...rope, qty: 3 }, item('cup', 'backpack', 0)], [{ id: 'slug', name: 'Slugs', loose: null }], { backpackArt: 'navy-stripe' }) },
    })
    expect(outcome.ok && (outcome.receiver.lubec as { gear: StoredGear }).gear.items.at(-1)).toEqual({ ...item('split', 'backpack', 0, { qty: 2 }), name: 'rope' })
  })

  it('brings a made supply the item takes from the sender\'s supplies', () => {
    const sling = item('sling', 'hands', 0, { kind: 'weapon', takes: 'slug' })
    const outcome = transfer.acceptLubecTransfer(characterWith(gearOf([sling], [{ id: 'slug', name: 'Slugs', loose: null }])), receiver, offer(sling, 'sling'))

    expect(outcome.ok && (outcome.receiver.lubec as { gear: StoredGear }).gear.supplies).toEqual([{ id: 'slug', name: 'Slugs', loose: null }])
  })

  it.each([
    ['the sender no longer holds the item', sender, offer(rope, 'gone'), 'missing_item'],
    ['the offer carries no item', sender, offer(null), 'missing_item'],
    ['the sender has no gear at all', { ownerUserId: 'u' }, offer(rope), 'missing_item'],
    ['the sender\'s gear is unreadable', characterWith('bad'), offer(rope), 'missing_item'],
    ['the item\'s kind changed', sender, offer({ ...rope, kind: 'weapon' }), 'kind_mismatch'],
    ['the stack is smaller than the offer', sender, offer({ ...rope, qty: 6 }), 'qty_changed'],
  ] as const)('drops the offer when %s', (_name, from, transferOffer, reason) => {
    expect(transfer.acceptLubecTransfer(from, receiver, transferOffer)).toEqual({ ok: false, reason })
  })

  it('refuses a receiver with no room, with the arrival rule\'s words', () => {
    const full = characterWith(gearOf([item('tent', 'backpack', 0, { size: 4 }), item('a', 'backpack', 0), item('b', 'backpack', 1), item('c', 'backpack', 2)]))

    expect(transfer.acceptLubecTransfer(sender, full, offer(rope))).toEqual({ ok: false, reason: 'no_room', message: LUBEC_NO_ROOM_TO_ACCEPT })
  })

  it.each([
    ['no `lubec`', { ownerUserId: 'u' }],
    ['no gear', { lubec: { counters: {} } }],
    ['unreadable gear lists', characterWith({ items: 'bad', supplies: [7] })],
  ])('reads a receiver with %s as empty gear', (_name, to) => {
    const outcome = transfer.acceptLubecTransfer(sender, to, offer(rope))

    expect(outcome.ok && (outcome.receiver.lubec as { gear: StoredGear }).gear).toMatchObject({ items: [{ id: 'rope', carrier: 'backpack', pocket: 0 }], supplies: [] })
  })

  it('skips stored entries that are not items, as the sheet does', () => {
    const outcome = transfer.acceptLubecTransfer(characterWith({ items: [7, rope, null] }), receiver, offer(rope))

    expect(outcome.ok && outcome.sender).toEqual({ lubec: { gear: { items: [], supplies: [] } } })
  })
})
