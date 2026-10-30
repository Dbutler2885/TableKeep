/** What an offer carries: the item without its place, whole or as part of a stack. It writes nothing. */
import { describe, expect, it } from 'vitest'
import type { LubecItem } from './gearRecord'
import { lubecOfferQty, lubecOfferSnapshot } from './offer'

const shells: LubecItem = {
  id: 'shells', kind: 'consumable', name: 'Shotgun shells', note: 'Damp.', size: 1, weight: 'normal', qty: 6, per: 6,
  carrier: 'stash', pocket: 1, slot: 0, cells: [2], batch: 'b1', check: 'pass', fits: 'gauge12', engraved: 'W.G.',
}

describe('lubecOfferSnapshot', () => {
  it('keeps the id of a whole stack and every field but its place, so it cannot say which carrier it was in', () => {
    const { carrier: _c, pocket: _p, slot: _s, cells: _l, batch: _b, check: _k, ...rest } = shells
    expect(lubecOfferSnapshot(shells, 6, () => 'new')).toEqual(rest)
  })

  it('makes part of a stack a new item of that many', () => {
    expect(lubecOfferSnapshot(shells, 2, () => 'new')).toMatchObject({ id: 'new', qty: 2, name: 'Shotgun shells', per: 6 })
  })

  it('leaves out a field with no value, which a stored document cannot hold', () => {
    expect(Object.keys(lubecOfferSnapshot({ ...shells, stock: undefined }, 6, () => 'new'))).not.toContain('stock')
  })
})

describe('lubecOfferQty', () => {
  it.each([['2', 2], ['6', 6], ['9', 6], ['0', 1], ['-3', 1], ['', 1], ['x', 1]])('reads %j of six as %i', (typed, qty) => {
    expect(lubecOfferQty({ qty: 6 }, typed)).toBe(qty)
  })
})
