/** Adding a new item (Rules S3, S4 and W1 to W4), with B's submit wording. */
import { describe, expect, it } from 'vitest'
import { addLubecItem } from './addItem'
import { emptyLubecGear, type LubecGear } from './gearRecord'
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
