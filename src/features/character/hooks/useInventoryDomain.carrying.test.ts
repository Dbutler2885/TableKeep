// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterInventoryItem } from '../../../types/app'
import { parseOseCharacter } from '../lib/storedCharacterRecord'
import { useInventoryDomain, type AddItemModalState } from './useInventoryDomain'

const mocks = vi.hoisted(() => ({ setDoc: vi.fn() }))
vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  doc: (_db: unknown, path: string) => ({ path }),
  serverTimestamp: () => 'server-time', setDoc: mocks.setDoc,
}))
const rope: CharacterInventoryItem = {
  id: 'rope', kind: 'general', typeId: 'custom', typeName: 'Rope', name: 'Rope',
  costGp: 60, equipped: false, qty: 3, notes: '', stack: { stackable: false },
}
const gold = (qty: number): CharacterInventoryItem => ({ ...rope, id: 'old-gold', kind: 'gold', typeId: 'gold', typeName: 'Gold', qty })
const spikes: CharacterInventoryItem = { ...rope, id: 'spikes', kind: 'consumable', typeId: 'con-iron-spikes', typeName: 'Iron Spikes', name: '', qty: 2 }
const target = parseOseCharacter('pc', { name: 'Ada', class: 'Fighter' })
type Params = Parameters<typeof useInventoryDomain>[0]

// Apply the real functional state updates synchronously and mock only Firebase I/O.
function domain(inventory: CharacterInventoryItem[] = [], overrides: Partial<Params> = {}) {
  let state: Record<string, CharacterInventoryItem[]> = { pc: inventory, other: [rope] }
  const setters = {
    setInventoryByCharacterId: vi.fn<Params['setInventoryByCharacterId']>((update) => { state = typeof update === 'function' ? update(state) : update }),
    setAddItemModal: vi.fn(), setOverflowWriting: vi.fn(), setOverflowFeedback: vi.fn(),
    setItemDetailId: vi.fn(), setDropConfirmItemId: vi.fn(), setSellConfirmItemId: vi.fn(),
    setGoldSpendAmount: vi.fn(), setApprovalPendingFeedback: vi.fn(), submitRequest: vi.fn(async () => undefined),
  }
  const params: Params = {
    campaignId: 'c', groupId: 'g', currentUsername: 'player1', effectiveSelected: target,
    canEditSelected: true, canEditInventoryDetails: true, selectedClassName: 'Fighter', canClassEquipArmour: true,
    selectedInventory: inventory, allInventories: state, availablePackedSlotCount: 1,
    requiresApprovalNow: false, isGuidedCreation: false, overflowWriting: false, addItemModal: null,
    ...setters, ...overrides,
  }
  const { result } = renderHook(() => useInventoryDomain(params))
  return { actions: result.current, setters, inventory: () => state.pc, state: () => state }
}
const goldTotal = (items: CharacterInventoryItem[]) => items.reduce((sum, item) => sum + (item.kind === 'gold' ? item.qty : 0), 0)
function expectDrop(index: number, fields: Record<string, unknown>) {
  const [ref, data, ...options] = mocks.setDoc.mock.calls[index]
  expect(ref.path).toMatch(/^groups\/g\/campaigns\/c\/items\/[^/]+$/)
  expect(data).toMatchObject({ status: 'dropped', droppedByCharacterId: 'pc', droppedByCharacterName: 'Ada', createdAt: 'server-time', updatedAt: 'server-time', ...fields })
  expect(data).not.toHaveProperty('id')
  expect(data).not.toHaveProperty('schemaVersion')
  expect(options).toEqual([])
}
beforeEach(() => { vi.resetAllMocks(); mocks.setDoc.mockResolvedValue(undefined) })
afterEach(cleanup)

describe('sheet gold overflow writes', () => {
  it('starts non-gold then gold writes, waits for both, then updates only the selected inventory', async () => {
    const finishes: Array<() => void> = []
    mocks.setDoc.mockImplementation(() => new Promise<void>((resolve) => { finishes.push(resolve) }))
    const d = domain([rope, { ...rope, id: 'newer' }])
    const changing = d.actions.setInventoryGold(150)
    expect(mocks.setDoc).toHaveBeenCalledTimes(2)
    expectDrop(0, { type: 'general', name: 'Rope', qty: '3' })
    expectDrop(1, { type: 'gold', goldAmount: 150 })
    finishes[1]()
    await Promise.resolve()
    expect(d.setters.setInventoryByCharacterId).not.toHaveBeenCalled()
    finishes[0]()
    await changing
    expect(d.inventory()).toEqual([rope])
    expect(d.state().other).toEqual([rope])
    expect(d.setters.setOverflowWriting.mock.calls).toEqual([[true], [false]])
    expect(d.setters.setOverflowFeedback).toHaveBeenCalledWith(expect.stringContaining('Not all items fit'))
  })
  it('cancels local gold changes if one write fails, even though another already succeeded', async () => {
    mocks.setDoc.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'))
    const original = [rope, { ...rope, id: 'newer' }]
    const d = domain(original)
    await d.actions.setInventoryGold(150)
    expect(mocks.setDoc).toHaveBeenCalledTimes(2)
    expect(d.inventory()).toBe(original)
    expect(d.setters.setOverflowFeedback).toHaveBeenCalledExactlyOnceWith('Failed to write overflow items. Gold change cancelled.')
    expect(d.setters.setOverflowWriting.mock.calls).toEqual([[true], [false]])
  })
  it('replaces old gold and floors amounts without I/O when everything fits', async () => {
    const d = domain([gold(50)])
    await d.actions.setInventoryGold(7.9)
    expect(goldTotal(d.inventory())).toBe(7)
    expect(d.inventory()[0].id).not.toBe('old-gold')
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(d.setters.setOverflowFeedback).not.toHaveBeenCalled()
  })
  it.each([{ effectiveSelected: null }, { overflowWriting: true }])('does nothing for %j', async (overrides) => {
    const d = domain([rope], overrides)
    await d.actions.setInventoryGold(100)
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(d.setters.setInventoryByCharacterId).not.toHaveBeenCalled()
  })
  it('allows gold replacement even when canEditSelected is false', async () => {
    const d = domain([], { canEditSelected: false })
    await d.actions.setInventoryGold(5)
    expect(goldTotal(d.inventory())).toBe(5)
  })
})

describe('sheet drops and recoverable consumables', () => {
  it.each([undefined, 3, 10, 1, 0, -2])('drops requested quantity %s, writing before local removal or subtraction', async (qty) => {
    let finish: () => void = () => undefined
    mocks.setDoc.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const d = domain([rope])
    const dropping = d.actions.dropItem('rope', qty)
    const all = qty === undefined || qty >= 3
    expectDrop(0, { type: 'general', name: 'Rope', qty: String(all ? 3 : qty) })
    expect(d.inventory()).toEqual([rope])
    expect(d.setters.setDropConfirmItemId).not.toHaveBeenCalled()
    finish()
    await dropping
    expect(d.inventory()).toEqual(all ? [] : [{ ...rope, qty: 3 - qty! }])
    expect(d.setters.setItemDetailId).toHaveBeenCalledWith(null)
    expect(d.setters.setDropConfirmItemId).toHaveBeenCalledWith(null)
  })
  it('propagates a drop failure and retains inventory and open dialogs', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('denied'))
    const d = domain([rope])
    await expect(d.actions.dropItem('rope')).rejects.toThrow('denied')
    expect(d.inventory()).toEqual([rope])
    expect(d.setters.setItemDetailId).not.toHaveBeenCalled()
    expect(d.setters.setDropConfirmItemId).not.toHaveBeenCalled()
  })
  it.each(['missing', 'old-gold'])('ignores an absent item or gold: %s', async (id) => {
    const d = domain([gold(5)])
    await d.actions.dropItem(id)
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(d.setters.setInventoryByCharacterId).not.toHaveBeenCalled()
  })
  it.each([1, 2])('consumes a recoverable stack of %s before its dropped-item write settles', async (qty) => {
    let finish: () => void = () => undefined
    mocks.setDoc.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const item = { ...spikes, qty }
    const d = domain([item])
    const consuming = d.actions.consumeOne('spikes')
    expect(d.inventory()).toEqual(qty === 1 ? [] : [{ ...item, qty: 1 }])
    expectDrop(0, { type: 'consumable', typeId: 'con-iron-spikes', qty: '1' })
    expect(d.setters.setOverflowFeedback).not.toHaveBeenCalled()
    finish()
    await consuming
    expect(d.setters.setOverflowFeedback).toHaveBeenCalledWith(expect.stringContaining(qty === 1 ? '(none left)' : '(1 left)'))
  })
  it('keeps local consumption on a recoverable-drop failure and leaves dialogs open', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('offline'))
    const d = domain([spikes])
    await expect(d.actions.consumeOne('spikes')).rejects.toThrow('offline')
    expect(d.inventory()).toEqual([{ ...spikes, qty: 1 }])
    expect(d.setters.setOverflowFeedback).not.toHaveBeenCalled()
    expect(d.setters.setItemDetailId).not.toHaveBeenCalled()
  })
})

describe('sheet sales', () => {
  it('sells a partial stack and writes overflow proceeds before changing local quantity', async () => {
    let finish: () => void = () => undefined
    mocks.setDoc.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    const d = domain([rope])
    const selling = d.actions.sellItem('rope', 2)
    expectDrop(0, { type: 'gold', goldAmount: 120 })
    expect(d.inventory()).toEqual([rope])
    finish()
    await selling
    expect(d.inventory()).toEqual([{ ...rope, qty: 1 }])
    expect(d.setters.setOverflowWriting.mock.calls).toEqual([[true], [false]])
    expect(d.setters.setSellConfirmItemId).toHaveBeenCalledWith(null)
  })
  it('cancels a sale when overflow persistence fails', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('offline'))
    const d = domain([rope])
    await d.actions.sellItem('rope', 1)
    expect(d.inventory()).toEqual([rope])
    expect(d.setters.setOverflowFeedback).toHaveBeenCalledWith('Failed to write overflow items. Sale cancelled.')
    expect(d.setters.setSellConfirmItemId).not.toHaveBeenCalled()
    expect(d.setters.setOverflowWriting.mock.calls).toEqual([[true], [false]])
  })
  it('combines existing gold with a full-stack sale and rechunks it', async () => {
    const d = domain([rope, gold(50)], { availablePackedSlotCount: 3 })
    await d.actions.sellItem('rope')
    expect(d.inventory()).toMatchObject([{ kind: 'gold', qty: 100 }, { kind: 'gold', qty: 100 }, { kind: 'gold', qty: 30 }])
    expect(d.state().other).toEqual([rope])
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
  it('removes worthless gear without a campaign write or overflow feedback', async () => {
    const d = domain([{ ...rope, costGp: 0 }])
    await d.actions.sellItem('rope')
    expect(d.inventory()).toEqual([])
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(d.setters.setOverflowFeedback).not.toHaveBeenCalled()
  })
  it('submits the partial snapshot for approval without changing inventory', async () => {
    const d = domain([rope], { requiresApprovalNow: true })
    await d.actions.sellItem('rope', 2)
    expect(d.setters.submitRequest).toHaveBeenCalledWith('sell', 'pc', 'Ada', 'player1', { ...rope, qty: 2 })
    expect(d.inventory()).toEqual([rope])
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(d.setters.setApprovalPendingFeedback).toHaveBeenCalledWith('Sale sent to GM for approval.')
  })
  it.each([{ effectiveSelected: null }, { canEditSelected: false }, { overflowWriting: true }])('refuses sale for %j', async (overrides) => {
    const d = domain([rope], overrides)
    await d.actions.sellItem('rope')
    expect(d.setters.setInventoryByCharacterId).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('sheet additions defer capacity enforcement', () => {
  const modal: AddItemModalState = {
    equipped: false, kind: 'general', typeId: 'custom', typeName: 'New gear', name: '', costGp: '4', notes: '', description: '',
    damageDiceCount: '', damageDiceSides: '', rangeShort: '', rangeMedium: '', rangeLong: '', slow: false,
    twoHanded: false, isMagic: false, attackBonus: '', damageBonus: '', armourClass: '', shieldMod: '', magicMod: '',
    armourType: 'body', qty: '1', effectText: '',
  }
  it.each(['general', 'weapon', 'armour', 'ammunition', 'consumable'] as const)('adds a custom %s beyond capacity locally without a campaign write', (kind) => {
    const d = domain([rope], { addItemModal: { ...modal, kind } })
    d.actions.saveAddItem()
    expect(d.inventory()).toHaveLength(2)
    expect(d.inventory()[1]).toMatchObject({ kind, typeName: 'New gear', costGp: 4, equipped: false })
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(d.setters.setAddItemModal).toHaveBeenCalledWith(null)
  })
  it('sends creation for approval without touching local inventory', () => {
    const d = domain([rope], { addItemModal: modal, requiresApprovalNow: true })
    d.actions.saveAddItem()
    expect(d.setters.submitRequest).toHaveBeenCalledWith('create', 'pc', 'Ada', 'player1', expect.objectContaining({ kind: 'general' }))
    expect(d.inventory()).toEqual([rope])
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
  it('appends bulk items and gold for another character without spilling or writing documents', () => {
    const d = domain([rope])
    d.actions.addItemsToInventory('other', [rope, rope])
    d.actions.setInventoryGoldForCharacter('other', 250)
    expect(d.state().other).toHaveLength(6)
    expect(goldTotal(d.state().other)).toBe(250)
    expect(d.inventory()).toEqual([rope])
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})
