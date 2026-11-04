import { describe, expect, it } from 'vitest'
import { lubecSpendRound } from './attack'
import { lineageGear, lineageSupply, lineageWeapon } from './__tests__/itemLineageFixtures'
import { lubecDetachedItem, lubecDetachFromGear, lubecExportDetached, lubecGmPhysicalItem, lubecPlaceDetached, lubecSettleDetached, lubecTakeDetached } from './detachedItems'
import { lubecCommandItemId } from './itemIdentity'

const command = { commandId: 'throw-one' }

describe('detached physical records', () => {
  it('throws one unit and catches it back alongside its original remainder without merging', () => {
    const before = lineageGear()
    const thrown = lubecDetachFromGear(before, 'balls', 1, command)
    expect(thrown.gear.items).toEqual([{ ...lineageWeapon, qty: 3 }])
    expect(thrown.detached.item).toMatchObject({ id: lubecCommandItemId(command, 'split:balls'), qty: 1, impact: -1, future: lineageWeapon.future })
    expect(thrown.detached.item).not.toHaveProperty('carrier')
    expect(thrown.detached.item).not.toHaveProperty('slot')
    expect(thrown.detached.supplies).toEqual([lineageSupply])
    const caught = lubecPlaceDetached(thrown.gear, thrown.detached, { commandId: 'catch' }, 'hands')
    expect(caught.ok).toBe(true)
    if (!caught.ok) throw new Error(caught.msg)
    expect(caught.gear.items.map(({ id, qty, slot }) => ({ id, qty, slot }))).toEqual([
      { id: 'balls', qty: 3, slot: 0 }, { id: thrown.detached.item.id, qty: 1, slot: 1 },
    ])
    expect(caught.gear.items.reduce((sum, item) => sum + item.qty, 0)).toBe(4)
    expect(caught.gear.supplies).toEqual([lineageSupply])
    expect(before).toEqual(lineageGear())
  })

  it('retains the last unit id through Floor settlement, pickup and export', () => {
    const thrown = lubecDetachFromGear(lineageGear([{ ...lineageWeapon, qty: 1 }]), 'balls', 1, command)
    expect(thrown.gear.items).toEqual([])
    const settled = lubecSettleDetached({ floor: [], inFlight: thrown.detached })
    expect(settled).toEqual({ floor: [thrown.detached], inFlight: null })
    expect(lubecSettleDetached(settled)).toEqual(settled)
    const pickedUp = lubecPlaceDetached(lineageGear([]), settled.floor[0], { commandId: 'pickup' })
    expect(pickedUp).toMatchObject({ ok: true, item: { id: 'balls', qty: 1, carrier: 'backpack', pocket: 0 } })
    const exported = lubecExportDetached(settled.floor, new Map())
    expect(exported).toMatchObject({ floor: [], drops: [{ id: 'balls', qty: 1, status: 'dropped', supplies: [lineageSupply] }] })
    expect(exported.drops[0]).not.toHaveProperty('count')
    expect(exported.drops[0]).not.toHaveProperty('carrier')
    const stored = { ...exported.drops[0], carrier: '', createdAt: { seconds: 1 } }
    expect(lubecExportDetached(settled.floor, new Map([['balls', stored]])).drops).toEqual([stored])
  })

  it('keeps same-name/different-Impact Floor records distinct and refuses conflicting extant documents', () => {
    const floor = [lubecDetachedItem(lineageWeapon, [lineageSupply]), lubecDetachedItem({ ...lineageWeapon, id: 'other', impact: 3 }, [])]
    const { drops } = lubecExportDetached(floor, new Map())
    expect(drops.map(({ id, impact, qty }) => ({ id, impact, qty }))).toEqual([{ id: 'balls', impact: -1, qty: 4 }, { id: 'other', impact: 3, qty: 4 }])
    expect(() => lubecExportDetached(floor, new Map([['balls', { ...drops[0], impact: 5 }]]))).toThrow('conflicting dropped item')
    expect(() => lubecExportDetached(floor, new Map([['balls', { ...drops[0], status: 'library' }]]))).toThrow('conflicting dropped item')
    expect(floor).toHaveLength(2)
  })

  it('refuses duplicate Floor/in-flight ownership, duplicate hands and malformed source ownership', () => {
    const detached = lubecDetachedItem(lineageWeapon, [])
    expect(() => lubecSettleDetached({ floor: [detached], inFlight: detached })).toThrow('already has an owner')
    expect(() => lubecExportDetached([detached, detached], new Map())).toThrow('already has an owner')
    expect(() => lubecPlaceDetached(lineageGear(), detached, command, 'hands')).toThrow('already has an owner')
    expect(() => lubecDetachFromGear(lineageGear([lineageWeapon, lineageWeapon]), 'balls', 1, command)).toThrow('already has an owner')
    expect(() => lubecDetachFromGear(lineageGear(), 'missing', 1, command)).toThrow('no longer available')
    const childId = lubecCommandItemId(command, 'split:balls')
    expect(() => lubecDetachFromGear(lineageGear([lineageWeapon, { ...lineageWeapon, id: childId }]), 'balls', 1, command)).toThrow('already has an owner')
  })

  it('preserves both inputs on placement refusal and clears only placement/record metadata', () => {
    const gear = lineageGear([{ ...lineageWeapon, id: 'large', size: 2 }])
    const record = lubecDetachedItem({ ...lineageWeapon, id: 'loose' }, [lineageSupply])
    expect(lubecPlaceDetached(gear, record, command, 'hands')).toEqual({ ok: false, msg: 'Both hands are full.' })
    expect(gear.items).toHaveLength(1)
    expect(record.item.qty).toBe(4)
    const physical = lubecGmPhysicalItem({ ...lineageWeapon, status: 'dropped', droppedFrom: 'hands', droppedByUserId: 'u', createdAt: 1, supplies: [lineageSupply] })
    expect(physical).toEqual(lineageWeapon)
    expect(lubecDetachedItem(lineageWeapon, [])).toEqual({ item: expect.objectContaining({ id: 'balls' }), supplies: [] })
  })
})

it('takes exact Floor quantities without combining matching names or changing another lineage', () => {
  const floor = [lubecDetachedItem(lineageWeapon, [lineageSupply]), lubecDetachedItem({ ...lineageWeapon, id: 'other', impact: 7, qty: 2 }, [])]
  const first = lubecTakeDetached(floor, 'balls', 1, command)
  expect(first.records.map(({ item: { id, qty } }) => ({ id, qty }))).toEqual([{ id: 'balls', qty: 3 }, { id: 'other', qty: 2 }])
  expect(first.detached.item).toMatchObject({ id: lubecCommandItemId(command, 'split:balls'), qty: 1, impact: -1 })
  expect(first.detached.supplies).toEqual([lineageSupply])
  const last = lubecTakeDetached(first.records, 'balls', 3, { commandId: 'pickup-last' })
  expect(last.detached.item.id).toBe('balls')
  expect(last.records).toEqual([floor[1]])
  expect(floor.map(({ item }) => item.qty)).toEqual([4, 2])
  expect(first.detached.item.qty + last.detached.item.qty).toBe(4)
  expect(() => lubecTakeDetached(floor, 'gone', 1, command)).toThrow('no longer available')
  expect(() => lubecTakeDetached([floor[0], floor[0]], 'balls', 1, command)).toThrow('already has an owner')
  const collision = { ...floor[1], item: { ...floor[1].item, id: first.detached.item.id } }
  expect(() => lubecTakeDetached([floor[0], collision], 'balls', 1, command)).toThrow('already has an owner')
})

it('refuses a placed extant GM record instead of exporting a placed object', () => {
  const record = lubecDetachedItem(lineageWeapon, [lineageSupply])
  const { drops: [drop] } = lubecExportDetached([record], new Map())
  expect(() => lubecExportDetached([record], new Map([[drop.id, { ...drop, carrier: 'hands' }]]))).toThrow('conflicting dropped item')
})

it('conserves the firearm object and its remaining rounds after explicitly spending ammunition', () => {
  const gun = { ...lineageWeapon, qty: 1, mode: 'firearm' as const }
  const shot = lubecSpendRound(lineageGear([gun]), gun.id)
  expect(shot.ok).toBe(true)
  if (!shot.ok) throw new Error(shot.why)
  const detached = lubecDetachFromGear(shot.gear, gun.id, 1, command)
  expect(detached.gear.items).toEqual([])
  expect(detached.detached.item).toMatchObject({ id: gun.id, qty: 1, loaded: 2 })
  const { drops: [drop] } = lubecExportDetached([detached.detached], new Map())
  expect(drop.loaded).toBe(gun.loaded! - 1)
  expect(drop.qty).toBe(gun.qty)
})
