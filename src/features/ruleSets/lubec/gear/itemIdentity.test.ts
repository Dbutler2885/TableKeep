import { describe, expect, it } from 'vitest'
import { lineageWeapon } from './__tests__/itemLineageFixtures'
import { lubecCopyOf } from './stock'
import { assertLubecItemOwnership, lubecCommandItemId, lubecLibraryCopy, lubecSplitItem } from './itemIdentity'

const command = { commandId: 'throw/one' }

describe('physical item identity', () => {
  it('derives distinct safe ids by command, role and ordinal, stably across retries', () => {
    const first = lubecCommandItemId(command, 'split:balls')
    expect(first).toBe('item:throw%2Fone:split%3Aballs:0')
    expect(lubecCommandItemId(command, 'split:balls')).toBe(first)
    const ids = [first, lubecCommandItemId({ commandId: 'throw' }, 'one/split:balls'), lubecCommandItemId({ ...command, ordinal: 1 }, 'split:balls'), lubecCommandItemId(command, 'copy:balls'), lubecCommandItemId({ commandId: 'other' }, 'split:balls'), lubecCommandItemId({ ...command, role: 'explicit' }, 'split:balls')]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([{ commandId: '' }, { ...command, ordinal: -1 }, { ...command, ordinal: 0.5 }, { ...command, ordinal: NaN }])('refuses invalid identity %j', (identity) => {
    expect(() => lubecCommandItemId(identity, 'split')).toThrow('Invalid item command identity')
  })

  it.each([0, -1, 0.5, 5, Infinity, NaN])('refuses unavailable quantity %s', (qty) => {
    expect(() => lubecSplitItem(lineageWeapon, qty, command)).toThrow('quantity')
    expect(() => lubecLibraryCopy(lineageWeapon, qty, command)).toThrow('quantity')
  })

  it('preserves all fields and keeps the source id only on the remainder', () => {
    const before = structuredClone(lineageWeapon)
    const { detached, remainder } = lubecSplitItem(lineageWeapon, 1, command)
    expect(detached).toEqual({ ...lineageWeapon, id: lubecCommandItemId(command, 'split:balls'), qty: 1 })
    expect(remainder).toEqual({ ...lineageWeapon, qty: 3 })
    expect(detached.qty + remainder!.qty).toBe(lineageWeapon.qty)
    expect(lineageWeapon).toEqual(before)
    expect(lubecSplitItem(lineageWeapon, 4, command)).toEqual({ detached: lineageWeapon, remainder: null })
  })

  it('copies a library record deeply into a new lineage with a command-derived id', () => {
    const source = structuredClone(lineageWeapon)
    const copy = lubecLibraryCopy(source, 2, command)
    expect(copy).toEqual({ ...lubecCopyOf(source), id: lubecCommandItemId(command, 'copy:balls'), qty: 2 })
    expect(copy).not.toHaveProperty('carrier')
    expect(copy).not.toHaveProperty('slot')
    ;(source.future as { maker: string }).maker = 'changed'
    expect(copy.future).toEqual(lineageWeapon.future)
  })

  it('refuses child/copy ids that would be the original id', () => {
    const splitId = lubecCommandItemId(command, 'split:x')
    expect(() => lubecSplitItem({ ...lineageWeapon, id: splitId }, 1, { ...command, role: 'split:x' })).toThrow('distinct id')
    const copyId = lubecCommandItemId(command, 'copy:x')
    expect(() => lubecLibraryCopy({ ...lineageWeapon, id: copyId }, 1, { ...command, role: 'copy:x' })).toThrow('distinct id')
  })

  it('rejects duplicate ownership regardless of matching names or fields', () => {
    expect(() => assertLubecItemOwnership([lineageWeapon, { ...lineageWeapon }])).toThrow('already has an owner')
    expect(() => assertLubecItemOwnership([lineageWeapon, { ...lineageWeapon, id: 'different', impact: 3 }])).not.toThrow()
  })
})
