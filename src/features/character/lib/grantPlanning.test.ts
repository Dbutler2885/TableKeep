import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GrantTemplateEntry } from './characterTabTypes'
import { amountForTarget, makeInventoryItemFromTemplateEntry } from './grantPlanning'

describe('grant planning', () => {
  beforeEach(() => vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001'))
  afterEach(() => vi.restoreAllMocks())

  it('splits amounts with the remainder assigned from the first target', () => {
    expect(amountForTarget(7, true, 2, 0)).toBe(4)
    expect(amountForTarget(7, true, 2, 1)).toBe(3)
    expect(amountForTarget(7, false, 2, 1)).toBe(7)
    expect(amountForTarget(7, true, 0, 0)).toBe(7)
  })

  it.each([
    [{ key: 'wpn-sword', name: 'Sword', costGp: 10, qty: 1, kind: 'weapon', weaponId: 'sword' }, 'weapon'],
    [{ key: 'arm-shield', name: 'Shield', costGp: 10, qty: 1, kind: 'armour', armourId: 'shield' }, 'armour'],
    [{ key: 'ammo-arrows', name: 'Arrows', costGp: 5, qty: 1, kind: 'ammunition' }, 'ammunition'],
    [{ key: 'gear-oil', name: 'Oil flask', costGp: 2, qty: 1, kind: 'consumable' }, 'consumable'],
    [{ key: 'gear-rope', name: 'Rope', costGp: 1, qty: 1, kind: 'general' }, 'general'],
  ] as Array<[GrantTemplateEntry, string]>)('materializes %s entries', (entry, kind) => {
    expect(makeInventoryItemFromTemplateEntry(entry).kind).toBe(kind)
  })

  it('keeps oil non-stackable and initializes its fuel', () => {
    expect(makeInventoryItemFromTemplateEntry({ key: 'gear-oil', name: 'Oil flask', costGp: 2, qty: 1, kind: 'consumable' })).toMatchObject({ stack: { stackable: false }, amountRemaining: 24 })
  })
})
