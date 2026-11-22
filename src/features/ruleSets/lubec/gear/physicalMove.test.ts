import { describe, expect, it } from 'vitest'
import { lineageGear, lineageSupply, lineageWeapon } from './__tests__/itemLineageFixtures'
import { lubecMovePlan, type LubecMove, type LubecMoveRecord } from './containers'
import { lubecCommandItemId } from './itemIdentity'
import type { LubecGmItem } from './gmItem'

const physical = { commandId: 'physical-move' }
const move: LubecMove = { itemId: 'balls', physical, seen: { carrier: 'hands', slot: 0 } }
const source: LubecMoveRecord = { kind: 'character', gear: lineageGear() }
const empty: LubecMoveRecord = { kind: 'npc', gear: lineageGear([]) }
const gm = (item: LubecGmItem | null = null): LubecMoveRecord => ({ kind: 'gm-items', item })
const dropped = { ...lineageWeapon, carrier: '', status: 'dropped', supplies: [lineageSupply] } as LubecGmItem

function planned(from: LubecMoveRecord, to: LubecMoveRecord, intention = move) {
  const result = lubecMovePlan(from, to, intention)
  if (!result.ok) throw new Error(result.msg)
  return result
}

describe('public physical inventory plans', () => {
  it('splits sheet and dropped stacks while preserving the remainder id and all fields', () => {
    const sheet = planned(source, gm(), { ...move, qty: 1 })
    expect(sheet.from).toEqual({ kind: 'character', gear: lineageGear([{ ...lineageWeapon, qty: 3 }]) })
    expect(sheet.item).toMatchObject({ id: lubecCommandItemId(physical, 'split:balls'), qty: 1, impact: -1, supplies: [lineageSupply] })
    const drop = planned(gm(dropped), empty, { itemId: 'balls', physical, qty: 2, dest: 'hands' })
    expect(drop.from).toMatchObject({ item: { ...dropped, qty: 2 } })
    expect(drop.item).toMatchObject({ id: lubecCommandItemId(physical, 'split:balls'), qty: 2, carrier: 'hands', slot: 0, future: lineageWeapon.future })
    expect(planned(gm(dropped), empty, { itemId: 'balls', physical }).from).toEqual(gm())
  })

  it('retains whole-stack ids and makes every library output a distinct deterministic copy', () => {
    expect(planned(source, empty).item.id).toBe('balls')
    const library = gm({ ...dropped, status: 'library' })
    const intention = { itemId: 'balls', physical, qty: 1 }
    const first = planned(library, empty, intention)
    expect(first.from).toEqual(library)
    expect(first.item).toMatchObject({ id: lubecCommandItemId(physical, 'copy:balls'), qty: 1 })
    expect(first.to).toMatchObject({ gear: { supplies: [lineageSupply] } })
    expect(planned(library, empty, intention)).toEqual(first)
    expect(planned(library, empty, { ...intention, physical: { ...physical, ordinal: 1 } }).item.id).not.toBe(first.item.id)
  })

  it('refuses stale/missing source and destination records without mutating them', () => {
    const before = structuredClone({ source, empty })
    const staleMoves = [{ ...move, seen: undefined }, { ...move, seen: { carrier: 'body', slot: 0 } }, { ...move, itemId: 'missing' }]
    for (const intention of staleMoves) expect(lubecMovePlan(source, empty, intention)).toMatchObject({ ok: false })
    expect(lubecMovePlan({ kind: 'character', gear: null }, empty, move).ok).toBe(false)
    expect(lubecMovePlan(gm(), empty, move).ok).toBe(false)
    expect(lubecMovePlan(gm({ ...dropped, id: 'different' }), empty, move).ok).toBe(false)
    expect(lubecMovePlan({ kind: 'shared', carrier: null }, empty, move).ok).toBe(false)
    expect(lubecMovePlan(source, { kind: 'shared', carrier: null }, move).ok).toBe(false)
    expect(lubecMovePlan(source, { kind: 'npc', gear: null }, move).ok).toBe(false)
    expect({ source, empty }).toEqual(before)
  })

  it('preserves inputs and refuses placement, duplicate identity and extant drop conflicts', () => {
    const full: LubecMoveRecord = { kind: 'character', gear: lineageGear([{ ...lineageWeapon, id: 'other', size: 2 }]) }
    expect(lubecMovePlan(source, full, { ...move, dest: 'hands' })).toMatchObject({ ok: false })
    expect(() => planned(source, source)).toThrow('already has an owner')
    expect(() => planned(source, gm({ ...dropped, impact: 20 }))).toThrow('conflicting dropped item')
    expect(source).toEqual({ kind: 'character', gear: lineageGear() })
  })
})

it('moves an exact backing record while keeping its same-name neighbor and rejecting duplicate child ownership', () => {
  const neighbor = { ...lineageWeapon, id: 'neighbor', impact: 8 }
  const from: LubecMoveRecord = { kind: 'character', gear: lineageGear([lineageWeapon, neighbor]) }
  const split = planned(from, empty, { ...move, qty: 1 })
  expect(split.from).toEqual({ kind: 'character', gear: lineageGear([{ ...lineageWeapon, qty: 3 }, neighbor]) })
  expect(split.item).toMatchObject({ qty: 1, impact: -1 })
  const child = { ...neighbor, id: lubecCommandItemId(physical, 'split:balls') }
  expect(() => planned({ kind: 'character', gear: lineageGear([lineageWeapon, child]) }, empty, { ...move, qty: 1 })).toThrow('already has an owner')
})
