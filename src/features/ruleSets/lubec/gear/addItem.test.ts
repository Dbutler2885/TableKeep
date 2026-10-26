/** Adding a new item (Rules S3, S4 and W1 to W4), with B's submit wording. */
import { describe, expect, it } from 'vitest'
import { addLubecItem, editLubecItem } from './addItem'
import { emptyLubecGear, type LubecGear, type LubecItem } from './gearRecord'
import type { LubecItemDraft } from './stacks'

const thing = (extra: Partial<LubecItemDraft> = {}): LubecItemDraft => ({ kind: 'thing', name: 'Rope', note: '', size: 1, weight: 'normal', qty: 1, per: 1, ...extra })

const counter = () => {
  let n = 0
  return () => `id-${++n}`
}

const add = (gear: LubecGear, dest: string, draft: LubecItemDraft) => addLubecItem(gear, dest, draft, counter())

describe('addLubecItem', () => {
  it('puts one item at the place asked, with a new id and no place field it does not use', () => {
    const added = add(emptyLubecGear(), 'backpack#0', thing())
    expect(added).toEqual({
      ok: true,
      gear: { ...emptyLubecGear(), items: [{ ...thing(), id: 'id-1', carrier: 'backpack', pocket: 0 }] },
      first: { ...thing(), id: 'id-1', carrier: 'backpack', pocket: 0 },
      stacks: 1,
    })
  })

  it('gives a hand its slot and no pocket', () => {
    const added = add(emptyLubecGear(), 'hands#1', thing())
    expect(added.ok && added.first).toEqual({ ...thing(), id: 'id-1', carrier: 'hands', slot: 1 })
  })

  it('splits a count into stacks that share a batch, filling the backpack\'s other pockets', () => {
    const added = add(emptyLubecGear(), 'backpack#0', thing({ qty: 7 }))
    expect(added.ok && added.gear.items.map((i) => [i.id, i.qty, i.batch, i.pocket])).toEqual([
      ['id-2', 1, 'id-1', 0], ['id-3', 1, 'id-1', 0], ['id-4', 1, 'id-1', 0], ['id-5', 1, 'id-1', 0], ['id-6', 1, 'id-1', 0],
      ['id-7', 1, 'id-1', 1], ['id-8', 1, 'id-1', 2],
    ])
    expect(added.ok && added.stacks).toBe(7)
  })

  it('adds nothing when a stack does not fit, and says how many did', () => {
    expect(add(emptyLubecGear(), 'backpack#0', thing({ qty: 8 }))).toEqual({
      ok: false, msg: 'Only 7 of the 8 stacks fit there (7 slots). Put it somewhere roomier, or fit more in each slot.',
    })
  })

  it('refuses a draft the submit rules refuse, and a place the placement rule refuses', () => {
    expect(add(emptyLubecGear(), 'backpack#0', thing({ name: '  ' }))).toEqual({ ok: false, msg: 'Give it a name.' })
    expect(add(emptyLubecGear(), 'backpack#0', thing({ size: 8 }))).toEqual({
      ok: false, msg: 'An 8-slot thing never fits in a backpack. Hold it in both hands, or put it on a carrier such as a strap.',
    })
  })

  it('keeps a small thing in small stuff, whatever its count', () => {
    const added = add(emptyLubecGear(), 'backpack#small', thing({ size: 0, qty: 12, per: undefined }))
    expect(added.ok && added.gear.items).toEqual([{ ...thing({ size: 0, qty: 12, per: undefined }), id: 'id-1', carrier: 'backpack', pocket: null }])
  })
})

describe('editLubecItem', () => {
  const placed = (id: string, extra: Partial<LubecItem>): LubecItem => ({ ...thing(), id, carrier: 'backpack', pocket: 0, ...extra } as LubecItem)
  const gearOf = (...items: LubecItem[]): LubecGear => ({ ...emptyLubecGear(), items })
  const edit = (gear: LubecGear, id: string, dest: string, draft: LubecItemDraft) =>
    editLubecItem(gear, gear.items.find((x) => x.id === id) as LubecItem, dest, draft, counter())

  it('keeps the item\'s id, its place in the list and any field the form does not set, and clears what the form no longer says', () => {
    const rope = placed('a', { kept: 'yes', art: 'rope', shape: 'square', stock: 'Coil of rope', cells: [4], per: 1 })
    const after = edit(gearOf(rope, placed('b', { name: 'Map' })), 'a', 'backpack#0', thing({ name: 'Long rope', note: 'Frayed.' }))
    expect(after).toEqual({
      ok: true, extra: 0,
      item: { ...thing({ name: 'Long rope', note: 'Frayed.' }), id: 'a', kept: 'yes', carrier: 'backpack', pocket: 0 },
      gear: gearOf({ ...thing({ name: 'Long rope', note: 'Frayed.' }), id: 'a', kept: 'yes', carrier: 'backpack', pocket: 0 } as LubecItem, placed('b', { name: 'Map' })),
    })
  })

  it('moves it to the place picked, setting its own place aside so a full place it already fills still takes it', () => {
    const items = [0, 1, 2, 3, 4].map((k) => placed(`m${k}`, {}))
    const after = edit(gearOf(...items), 'm0', 'backpack#0', thing({ name: 'Rope' }))
    expect(after.ok && after.item).toMatchObject({ id: 'm0', carrier: 'backpack', pocket: 0 })
    const held = edit(gearOf(placed('h', { carrier: 'hands', slot: 1, pocket: undefined })), 'h', 'hands#1', thing())
    expect(held.ok && held.item).toEqual({ ...thing(), id: 'h', carrier: 'hands', slot: 1 })
  })

  it('adds the rest of a bigger count as new stacks of its batch, and keeps the batch it had', () => {
    const after = edit(gearOf(placed('a', {})), 'a', 'backpack#0', thing({ qty: 3 }))
    expect(after.ok && after.gear.items.map((i) => [i.id, i.qty, i.batch])).toEqual([['a', 1, 'id-1'], ['id-2', 1, 'id-1'], ['id-3', 1, 'id-1']])
    expect(after.ok && after.extra).toBe(2)
    const batched = edit(gearOf(placed('a', { batch: 'b7' })), 'a', 'backpack#0', thing({ qty: 2 }))
    expect(batched.ok && batched.gear.items.map((i) => i.batch)).toEqual(['b7', 'b7'])
  })

  it("clears a minimum Strength and both hands the form no longer says, and keeps the table's own penalty", () => {
    const weapon = (extra: Partial<LubecItemDraft>) => thing({ kind: 'weapon', name: 'Sledgehammer', mode: 'melee', wounds: ['blunt'], ...extra })
    const sledge = placed('s', { ...weapon({ minStrength: 60, hands: 2 }), handlePenaltyOverride: 10 })
    const after = edit(gearOf(sledge), 's', 'backpack#0', weapon({}))
    expect(after.ok && after.item).toMatchObject({ handlePenaltyOverride: 10 })
    expect(after.ok && ['minStrength', 'hands'].filter((k) => k in after.item)).toEqual([])
  })

  it('keeps a recorded Strength roll only for a heavy thing on you', () => {
    const anvil = placed('a', { weight: 'heavy', check: 'fail', carrier: 'hands', slot: 0, pocket: undefined })
    const heavy = edit(gearOf(anvil), 'a', 'hands', thing({ weight: 'heavy' }))
    expect(heavy.ok && heavy.item.check).toBe('fail')
    const light = edit(gearOf(anvil), 'a', 'hands', thing())
    expect(light.ok && 'check' in light.item).toBe(false)
  })

  it('changes nothing when the draft or the place is refused', () => {
    const gear = gearOf(placed('a', {}))
    expect(edit(gear, 'a', 'backpack#0', thing({ name: '' }))).toEqual({ ok: false, msg: 'Give it a name.' })
    expect(edit(gear, 'a', 'body', thing({ size: 2 }))).toEqual({ ok: false, msg: 'Body slots take 1-slot things only. Try both hands, the backpack or a carrier.' })
  })
})
