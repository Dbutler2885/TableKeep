import { describe, expect, it } from 'vitest'
import type { LubecItem } from './gearRecord'
import { lubecCarrierView, lubecChangeCarrier, lubecNewSharedCarrier, parseLubecSharedCarrier, type LubecSharedCarrier } from './sharedCarrier'

const pockets = [{ name: 'Hull', slots: 4, max: 2 }, { name: 'Locker', slots: 2, max: 1 }]
const thing = (id: string, pocket: number | null, size: 0 | 1 | 2, name = id) =>
  ({ id, kind: 'thing', name, note: '', size, weight: 'normal', qty: 1, carrier: 'skiff', pocket }) as LubecItem
const skiff = (items: LubecItem[]): LubecSharedCarrier => ({ id: 'skiff', name: 'Skiff', type: 'skiff', pockets, ownerCharacterId: 'wayne', items })
const draft = (over: object = {}) => ({ type: 'skiff', name: 'Skiff', pockets, ...over })

describe('parseLubecSharedCarrier', () => {
  it('reads a stored carrier, its id from the document, and keeps fields it does not model', () => {
    const read = parseLubecSharedCarrier({ id: 'old', name: 'Skiff', type: 'skiff', pockets, ownerCharacterId: 'wayne', items: [{ id: 'a', carrier: 'skiff' }, 'junk'], paint: 'red' }, 'skiff')
    expect(read).toMatchObject({ id: 'skiff', name: 'Skiff', ownerCharacterId: 'wayne', paint: 'red' })
    expect(read.items.map((i) => i.id)).toEqual(['a'])
  })

  it('reads a missing or unreadable record as empty, with no owner', () => {
    expect(parseLubecSharedCarrier(null, 'x')).toMatchObject({ id: 'x', name: '', ownerCharacterId: '', items: [], pockets: [] })
    expect(parseLubecSharedCarrier({ ownerCharacterId: 7, items: 'no' }, 'x')).toMatchObject({ ownerCharacterId: '', items: [] })
  })
})

describe('lubecNewSharedCarrier', () => {
  it('is empty, trimmed and owned by the character named', () => {
    expect(lubecNewSharedCarrier(draft({ name: ' Skiff ' }), 'id', 'wayne')).toEqual({ ok: true, carrier: { id: 'id', name: 'Skiff', type: 'skiff', pockets, ownerCharacterId: 'wayne', items: [] } })
  })

  it('refuses what the add dialog refuses', () => {
    expect(lubecNewSharedCarrier(draft({ name: ' ' }), 'id', 'wayne')).toEqual({ ok: false, msg: 'Give it a name.' })
  })
})

describe('lubecChangeCarrier', () => {
  it('takes a new name and pockets that still hold what is in it', () => {
    const next = [{ name: 'Hull', slots: 3, max: 2 }, { name: 'Locker', slots: 2, max: 1 }]
    expect(lubecChangeCarrier(skiff([thing('a', 0, 2)]), draft({ name: ' Dory ', pockets: next }))).toEqual({ ok: true, name: 'Dory', pockets: next })
  })

  it('refuses the submit rules first', () => {
    expect(lubecChangeCarrier(skiff([]), draft({ name: '' }))).toEqual({ ok: false, msg: 'Give it a name.' })
  })

  it('refuses taking away a pocket with something in it', () => {
    expect(lubecChangeCarrier(skiff([thing('tin', 1, 1, 'Tin')]), draft({ pockets: [pockets[0]] }))).toEqual({ ok: false, msg: "Tin wouldn't fit. Take it out first." })
  })

  it('refuses a pocket whose largest thing is now too small for what is in it', () => {
    const narrower = [{ name: 'Hull', slots: 4, max: 1 }, pockets[1]]
    expect(lubecChangeCarrier(skiff([thing('oar', 0, 2, 'Oar')]), draft({ pockets: narrower }))).toEqual({ ok: false, msg: "Oar wouldn't fit. Take it out first." })
  })

  it('refuses a pocket too small for all it holds', () => {
    const tight = [{ name: 'Hull', slots: 2, max: 2 }, pockets[1]]
    expect(lubecChangeCarrier(skiff([thing('a', 0, 2), thing('b', 0, 1)]), draft({ pockets: tight }))).toEqual({ ok: false, msg: 'Hull would be too small for what is in it. Take something out first.' })
  })

  it('leaves small stuff alone', () => {
    expect(lubecChangeCarrier(skiff([thing('pin', null, 0)]), draft({ pockets: [pockets[0]] })).ok).toBe(true)
  })
})

describe('lubecCarrierView', () => {
  it('reads the carrier as gear with the sheet\'s supplies', () => {
    const supplies = [{ id: 's', name: 'Rock salt' }]
    expect(lubecCarrierView(skiff([thing('a', 0, 1)]), supplies)).toMatchObject({ carriers: [{ id: 'skiff' }], items: [{ id: 'a' }], supplies })
  })
})
