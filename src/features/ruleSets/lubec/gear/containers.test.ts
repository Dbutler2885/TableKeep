/**
 * The safe move's pure plan (spec 4.7): every pair of records a move can
 * cross, the stale-move refusal, the room check against the destination as it
 * was read, and a refused move that leaves both records as they were.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecCarrierRecord, parseLubecGear, type LubecGear, type LubecItem } from './gearRecord'
import { parseLubecGmItem } from './gmItem'
import {
  LUBEC_STALE_MOVE,
  lubecCopyOf,
  lubecMovePlan,
  type LubecMove,
  type LubecMoveRecord,
} from './containers'

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Record<string, unknown> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

const flashlight = T('flashlight', 'backpack', 0, 'Flashlight', 1, { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2, cells: [4] })
const anvil = T('anvil', 'hands', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' })
const watch = T('watch', 'body', 1, 'Timex watch', 0)
const sleepingBag = T('sleeping-bag', 'chest', 0, 'Sleeping bag', 2)
const chest = { id: 'chest', name: 'Bedroom chest', type: 'chest', pockets: [{ name: 'Chest', slots: 12, max: 8 }] }

const wayne = (): LubecMoveRecord => ({
  kind: 'character',
  gear: parseLubecGear({ items: [flashlight, anvil, watch, sleepingBag], carriers: [chest], overrides: [], supplies: [] }),
})
const emptySheet = (kind: 'character' | 'npc' = 'character'): LubecMoveRecord => ({ kind, gear: parseLubecGear({}) })

const skiff = (items: unknown[] = []): LubecMoveRecord => ({
  kind: 'shared',
  carrier: parseLubecCarrierRecord({ name: "Stephen's skiff", type: 'boat', ownerCharacterId: 'stephen', pockets: [{ name: 'Hull', slots: 2, max: 2 }], items }, 'skiff'),
})
const cigarBox = (items: unknown[] = []): LubecMoveRecord => ({
  kind: 'hidden',
  carrier: parseLubecCarrierRecord({ name: 'Cigar box', type: 'box', pockets: [{ name: 'Box', slots: 1, max: 1 }], items }, 'cigar-box'),
})
const gmItems = (item: unknown = null): LubecMoveRecord => ({ kind: 'gm-items', item: item ? parseLubecGmItem(item, (item as { id: string }).id) : null })

const seenAt = (item: { carrier: string; pocket?: number | null; slot?: number | null }) => ({ carrier: item.carrier, pocket: item.pocket, slot: item.slot })
const moveOf = (item: ReturnType<typeof T>, extra: Partial<LubecMove> = {}): LubecMove => ({ itemId: item.id, seen: seenAt(item), ...extra })

const itemsOf = (record: LubecMoveRecord): LubecItem[] => {
  if ('gear' in record) return record.gear?.items ?? []
  if ('carrier' in record) return record.carrier?.items ?? []
  return record.item ? [record.item] : []
}
const ids = (record: LubecMoveRecord) => itemsOf(record).map((i) => i.id)
const planned = (from: LubecMoveRecord, to: LubecMoveRecord, move: LubecMove) => {
  const plan = lubecMovePlan(from, to, move)
  if (!plan.ok) throw new Error(plan.msg)
  return plan
}

describe('a move between two records', () => {
  it('takes a thing from the backpack to a shared carrier', () => {
    const plan = planned(wayne(), skiff(), moveOf(flashlight, { dest: 'skiff#0' }))

    expect(ids(plan.from)).toEqual(['anvil', 'watch', 'sleeping-bag'])
    expect(plan.to).toMatchObject({ kind: 'shared', carrier: { id: 'skiff', ownerCharacterId: 'stephen' } })
    expect(itemsOf(plan.to)).toEqual([{ ...flashlight, carrier: 'skiff', pocket: 0, cells: undefined }].map(({ cells: _cells, ...rest }) => rest))
    expect(plan.item).toBe(itemsOf(plan.to)[0])
  })

  it('takes a thing from a personal carrier to a shared carrier, and back into the backpack', () => {
    const into = planned(wayne(), skiff(), moveOf(sleepingBag, { dest: 'skiff' }))
    expect(itemsOf(into.to)).toEqual([{ ...sleepingBag, carrier: 'skiff', pocket: 0 }])

    const back = planned(into.to, into.from, { itemId: 'sleeping-bag', seen: { carrier: 'skiff', pocket: 0 }, dest: 'backpack' })
    expect(itemsOf(back.from)).toEqual([])
    expect(itemsOf(back.to).find((i) => i.id === 'sleeping-bag')).toEqual({ ...sleepingBag, carrier: 'backpack', pocket: 0 })
  })

  it('refuses a 2-slot thing into hands that are full, with the placement rule\'s words', () => {
    const into = planned(wayne(), skiff(), moveOf(sleepingBag, { dest: 'skiff' }))
    const back = lubecMovePlan(into.to, into.from, { itemId: 'sleeping-bag', seen: { carrier: 'skiff', pocket: 0 }, dest: 'hands' })

    expect(back).toEqual({ ok: false, msg: 'A 2-slot thing takes both hands. Empty both hands first.' })
  })

  it('takes a thing from a shared carrier to the body, a hand and a personal carrier', () => {
    const shared = skiff([T('rope', 'skiff', 0, 'Rope', 1)])
    const seen = { carrier: 'skiff', pocket: 0 }

    expect(itemsOf(planned(shared, wayne(), { itemId: 'rope', seen, dest: 'body' }).to).at(-1)).toMatchObject({ carrier: 'body', slot: 0 })
    expect(itemsOf(planned(shared, emptySheet(), { itemId: 'rope', seen, dest: 'hands#1' }).to)).toEqual([T('rope', 'hands', 1, 'Rope', 1)])
    expect(lubecMovePlan(shared, wayne(), { itemId: 'rope', seen, dest: 'hands' })).toEqual({ ok: false, msg: 'Both hands are full.' })
    expect(itemsOf(planned(shared, wayne(), { itemId: 'rope', seen, dest: 'chest#0' }).to).at(-1)).toMatchObject({ carrier: 'chest', pocket: 0 })
  })

  it('puts a thing into a hidden carrier and takes it back out', () => {
    const into = planned(wayne(), cigarBox(), moveOf(watch, { dest: 'cigar-box' }))
    const { slot: _slot, ...unslotted } = watch
    expect(itemsOf(into.to)).toEqual([{ ...unslotted, carrier: 'cigar-box', pocket: null }])
    expect(ids(into.from)).not.toContain('watch')

    const back = planned(into.to, into.from, { itemId: 'watch', seen: { carrier: 'cigar-box', pocket: null }, dest: 'body#1' })
    expect(itemsOf(back.to).at(-1)).toEqual({ ...unslotted, carrier: 'body', slot: 1 })
    expect(itemsOf(back.from)).toEqual([])
  })

  it('moves a thing between a shared carrier and a hidden one, both ways', () => {
    const rope = T('rope', 'skiff', 0, 'Rope', 1)
    const into = planned(skiff([rope]), cigarBox(), { itemId: 'rope', seen: seenAt(rope), dest: 'cigar-box#0' })
    expect(itemsOf(into.to)).toEqual([{ ...rope, carrier: 'cigar-box', pocket: 0 }])

    const back = planned(into.to, into.from, { itemId: 'rope', seen: { carrier: 'cigar-box', pocket: 0 }, dest: 'skiff' })
    expect(itemsOf(back.to)).toEqual([rope])
    expect(itemsOf(back.from)).toEqual([])
  })

  it('keeps a Strength roll on you, takes it off when the thing leaves you, and records a new one', () => {
    expect(itemsOf(planned(wayne(), skiff(), moveOf(anvil, { dest: 'skiff' })).to)[0].check).toBeUndefined()
    expect(itemsOf(planned(wayne(), emptySheet(), moveOf(anvil, { dest: 'hands' })).to)[0].check).toBe('fail')

    const crate = T('crate', 'skiff', 0, 'Crate', 1, { weight: 'heavy' })
    const lifted = planned(skiff([crate]), emptySheet(), { itemId: 'crate', seen: seenAt(crate), dest: 'hands', check: 'pass' })
    expect(lifted.item).toMatchObject({ carrier: 'hands', slot: 0, check: 'pass' })
  })

  it('forgets a switched-off Speed loss on the sheet a thing leaves, and keeps one still true', () => {
    const switchedOff = (record: LubecMoveRecord): LubecMoveRecord =>
      ({ kind: 'character', gear: { ...(record as { gear: LubecGear }).gear, overrides: ['heavy:anvil'] } })
    const left = planned(switchedOff(wayne()), skiff(), moveOf(anvil, { dest: 'skiff' })).from as { gear: LubecGear }
    expect(left.gear.overrides).toEqual([])
    const stayed = planned(switchedOff(wayne()), skiff(), moveOf(flashlight, { dest: 'skiff' })).from as { gear: LubecGear }
    expect(stayed.gear.overrides).toEqual(['heavy:anvil'])
  })

  it('keeps the boxes a dragged thing was dropped on only in the main pocket', () => {
    const rope = T('rope', 'skiff', 0, 'Rope', 1)
    expect(planned(skiff([rope]), emptySheet(), { itemId: 'rope', seen: seenAt(rope), dest: 'backpack#0', cells: [2] }).item.cells).toEqual([2])
    expect(planned(skiff([rope]), emptySheet(), { itemId: 'rope', seen: seenAt(rope), dest: 'backpack#1', cells: [2] }).item.cells).toBeUndefined()
  })

  it('moves between a character and an NPC sheet the same way', () => {
    const plan = planned(wayne(), emptySheet('npc'), moveOf(flashlight, { dest: 'backpack' }))

    expect(plan.to.kind).toBe('npc')
    expect(itemsOf(plan.to)).toEqual([{ ...flashlight, carrier: 'backpack', pocket: 0, cells: undefined }].map(({ cells: _cells, ...rest }) => rest))
  })
})

describe('a drop to the GM Items tab', () => {
  const by = { characterId: 'wayne', characterName: 'Wayne Gardner', userId: 'wayne-player' }

  it('takes the thing off the sheet and makes a dropped item with who dropped it and from where', () => {
    const plan = planned(wayne(), gmItems(), moveOf(anvil, { droppedBy: by }))
    const { carrier: _carrier, slot: _slot, check: _check, ...rest } = anvil

    expect(ids(plan.from)).toEqual(['flashlight', 'watch', 'sleeping-bag'])
    expect(plan.to).toEqual({
      kind: 'gm-items',
      item: {
        ...rest, status: 'dropped', droppedFrom: 'hands',
        droppedByCharacterId: 'wayne', droppedByCharacterName: 'Wayne Gardner', droppedByUserId: 'wayne-player',
      },
    })
  })

  it('names a carrier by its name, from a personal, shared or hidden carrier, and from an NPC sheet', () => {
    expect(planned(wayne(), gmItems(), moveOf(sleepingBag, { droppedBy: by })).item).toMatchObject({ droppedFrom: 'Bedroom chest' })

    const rope = T('rope', 'skiff', 0, 'Rope', 1)
    expect(planned(skiff([rope]), gmItems(), { itemId: 'rope', seen: seenAt(rope), droppedBy: by }).item).toMatchObject({ droppedFrom: "Stephen's skiff" })

    const ring = T('ring', 'cigar-box', null, 'Ring', 0)
    const fromHidden = planned(cigarBox([ring]), gmItems(), { itemId: 'ring', seen: seenAt(ring), droppedBy: by })
    expect(fromHidden.item).toMatchObject({ droppedFrom: 'Cigar box' })
    expect(itemsOf(fromHidden.from)).toEqual([])

    const npc: LubecMoveRecord = { kind: 'npc', gear: parseLubecGear({ items: [anvil] }) }
    expect(planned(npc, gmItems(), moveOf(anvil)).from).toEqual({ kind: 'npc', gear: parseLubecGear({}) })
  })
})

describe('the GM giving an item', () => {
  const crowbar = { id: 'crowbar', kind: 'thing', name: 'Crowbar', size: 2, qty: 1, weight: 'normal', note: 'Rusty.', engraved: 'J.F.' }

  it('gives a dropped item: it arrives by the arrival rule and leaves the tab, without the tab\'s own fields', () => {
    const stored = { ...crowbar, status: 'dropped', droppedByUserId: 'u', droppedFrom: 'hands', createdAt: { seconds: 1 }, updatedAt: { seconds: 2 } }
    const plan = planned(gmItems(stored), emptySheet(), { itemId: 'crowbar' })

    expect(plan.from).toEqual({ kind: 'gm-items', item: null })
    expect(plan.item).toEqual({ ...crowbar, carrier: 'backpack', pocket: 0 })
  })

  it('gives a copy of a library item, which stays in the tab', () => {
    const library = gmItems({ ...crowbar, status: 'library' })
    const plan = planned(library, emptySheet(), { itemId: 'crowbar', copyId: 'crowbar-copy' })

    expect(plan.from).toEqual(library)
    expect(plan.item).toEqual({ ...lubecCopyOf(crowbar as Partial<LubecItem>), id: 'crowbar-copy', carrier: 'backpack', pocket: 0 })
    expect(plan.item).not.toHaveProperty('engraved')
  })

  it('needs a copy id to give a library item', () => {
    expect(() => lubecMovePlan(gmItems({ ...crowbar, status: 'library' }), emptySheet(), { itemId: 'crowbar' })).toThrow(/copyId/)
  })

  it('refuses when the receiver has no room, with the arrival rule\'s words', () => {
    const full: LubecMoveRecord = { kind: 'character', gear: parseLubecGear({ items: [T('tent', 'backpack', 0, 'Tent', 4), T('a', 'backpack', 0, 'A', 1)] }) }
    const plan = lubecMovePlan(gmItems({ ...crowbar, status: 'dropped' }), full, { itemId: 'crowbar' })

    expect(plan).toEqual({ ok: false, msg: 'Not enough room to accept this item. Make room in your backpack or hands, then accept again.' })
  })
})

describe('a stale move', () => {
  it('refuses when the item is no longer where the player saw it', () => {
    const elsewhere = { ...seenAt(flashlight), pocket: 1 }

    expect(lubecMovePlan(wayne(), skiff(), { itemId: 'flashlight', seen: elsewhere, dest: 'skiff' })).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
    expect(lubecMovePlan(wayne(), skiff(), { itemId: 'flashlight', seen: { carrier: 'hands', slot: 0 }, dest: 'skiff' })).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
    expect(LUBEC_STALE_MOVE).toBe('Someone moved that first. Nothing changed.')
  })

  it('refuses when the item is gone, or never had a place the player saw', () => {
    expect(lubecMovePlan(skiff(), wayne(), { itemId: 'rope', seen: { carrier: 'skiff', pocket: 0 }, dest: 'hands' })).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
    expect(lubecMovePlan(wayne(), skiff(), { itemId: 'flashlight', dest: 'skiff' })).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
    expect(lubecMovePlan(gmItems(), emptySheet(), { itemId: 'crowbar' })).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
  })

  it('refuses when either record is gone', () => {
    const gone: LubecMoveRecord = { kind: 'shared', carrier: null }

    expect(lubecMovePlan(gone, wayne(), { itemId: 'rope', seen: { carrier: 'skiff', pocket: 0 }, dest: 'hands' })).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
    expect(lubecMovePlan(wayne(), gone, moveOf(flashlight, { dest: 'skiff' })).ok).toBe(false)
    expect(lubecMovePlan(wayne(), { kind: 'character', gear: null }, moveOf(flashlight, { dest: 'hands' }))).toEqual({ ok: false, msg: LUBEC_STALE_MOVE })
  })
})

describe('room is checked against the destination as it was read', () => {
  it('refuses when the carrier filled up since the page drew it', () => {
    // The page drew an empty skiff; the transaction read one that a friend has since filled.
    const read = skiff([T('oars', 'skiff', 0, 'Oars', 2)])
    const plan = lubecMovePlan(wayne(), read, moveOf(sleepingBag, { dest: 'skiff#0' }))

    expect(plan).toEqual({ ok: false, msg: 'Hull is full: 0 of 2 free, and this needs 2.' })
    expect(lubecMovePlan(wayne(), skiff(), moveOf(sleepingBag, { dest: 'skiff#0' })).ok).toBe(true)
  })

  it('changes neither record when a move is refused', () => {
    const from = wayne()
    const to = skiff([T('oars', 'skiff', 0, 'Oars', 2)])
    const before = structuredClone({ from, to })

    lubecMovePlan(from, to, moveOf(sleepingBag, { dest: 'skiff' }))

    expect({ from, to }).toEqual(before)
  })

  it('changes neither record it was given when a move goes through', () => {
    const from = wayne()
    const to = skiff()
    const before = structuredClone({ from, to })

    planned(from, to, moveOf(flashlight, { dest: 'skiff' }))

    expect({ from, to }).toEqual(before)
  })
})

describe('copying an item', () => {
  it('copies only the fields a design has, deep, so the copy never follows the original', () => {
    const src = { ...flashlight, armor: { cut: 1, pierce: 0, blunt: 0, gun: 0 }, minStrength: 40, stock: 'flashlight', check: 'fail' } as unknown as LubecItem
    const copy = lubecCopyOf(src)

    expect(Object.keys(copy).sort()).toEqual(['armor', 'capacity', 'hold', 'kind', 'loaded', 'minStrength', 'name', 'note', 'qty', 'size', 'takes', 'weight'])
    src.armor!.cut = 9
    expect(copy.armor?.cut).toBe(1)
  })
})
