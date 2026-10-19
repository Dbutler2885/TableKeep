import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase/firestore'
import {
  computeOverflow, goldChunksForAmount, makeDroppedGoldCampaignItem, makeGoldItem,
  normalizeGoldAmount, writeDroppedOverflow,
} from './inventoryOverflow'

const mocks = vi.hoisted(() => ({ setDoc: vi.fn() }))
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  doc: (_db: unknown, path: string) => ({ path }),
  serverTimestamp: () => 'server-time', setDoc: mocks.setDoc,
}))
const db = {} as Firestore
beforeEach(() => { vi.resetAllMocks(); mocks.setDoc.mockResolvedValue(undefined) })

describe('gold normalization and chunking boundaries', () => {
  it.each([Number.NaN, Infinity, -Infinity, -10, 0])('normalizes %s to zero', (amount) => {
    expect(normalizeGoldAmount(amount)).toBe(0)
    expect(goldChunksForAmount(amount)).toEqual([])
  })
  it.each([[1.9, [1]], [100, [100]], [100.9, [100]], [201.8, [100, 100, 1]]])('chunks %s', (amount, expected) => {
    expect(goldChunksForAmount(amount as number)).toEqual(expected)
  })
  it('puts all remaining gold in the 500th row instead of dropping it at the allocation cap', () => {
    const chunks = goldChunksForAmount(50_123)
    expect(chunks).toHaveLength(500)
    expect(chunks.slice(0, -1)).toEqual(Array(499).fill(100))
    expect(chunks[499]).toBe(223)
    expect(chunks.reduce((sum, n) => sum + n, 0)).toBe(50_123)
  })
})

describe('overflow early return and reshaping', () => {
  it('returns the same inventory and oversized gold row unchanged when the row count fits', () => {
    const inventory = [makeGoldItem(999)]
    const result = computeOverflow(inventory, 1, 'pc', 'Ada')
    expect(result.keptInventory).toBe(inventory)
    expect(result).toEqual({ keptInventory: inventory, droppedItems: [], droppedGoldAmount: 0, feedbackMessage: null })
  })
  it('can rechunk overflowing gold rows without dropping anything or reporting overflow', () => {
    const inventory = [makeGoldItem(20), makeGoldItem(30)]
    const before = structuredClone(inventory)
    const result = computeOverflow(inventory, 1, 'pc', 'Ada')
    expect(result.keptInventory).toMatchObject([{ kind: 'gold', qty: 50, equipped: false }])
    expect(result.keptInventory[0].id).not.toBe(inventory[0].id)
    expect(result.droppedGoldAmount).toBe(0)
    expect(result.droppedItems).toEqual([])
    expect(result.feedbackMessage).toBeNull()
    expect(inventory).toEqual(before)
  })
  it('leaves equipped gold untouched and counts only packed gold for overflow', () => {
    const equipped = { ...makeGoldItem(500), equipped: true }
    const result = computeOverflow([makeGoldItem(200), equipped, makeGoldItem(50)], 1, 'pc', 'Ada')
    expect(result.keptInventory).toMatchObject([equipped, { kind: 'gold', qty: 100 }])
    expect(result.droppedGoldAmount).toBe(150)
    expect(result.keptInventory[0]).toBe(equipped)
  })
})

describe('dropped-overflow persistence', () => {
  it.each([0, -1])('does no writes for no items and gold %s', async (amount) => {
    await writeDroppedOverflow(db, 'c', 'g', [], amount, 'pc', 'Ada')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
  it('writes exact canonical gold fields at the group-scoped item path without a character stamp', async () => {
    const item = makeDroppedGoldCampaignItem(47, 'pc', 'Ada', 'stable-id')
    await writeDroppedOverflow(db, 'c', 'g', [item], 0, 'pc', 'Ada')
    expect(mocks.setDoc).toHaveBeenCalledExactlyOnceWith({ path: 'groups/g/campaigns/c/items/stable-id' }, {
      name: '', type: 'gold', typeId: 'gold', typeName: 'Gold', status: 'dropped', portraitPath: '', portraitFocusX: 50, portraitFocusY: 50,
      tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 }, description: '', gpValue: '0', qty: '1', isMagic: false,
      weaponStats: { damageDiceCount: '', damageDiceSides: '', attackBonus: '', damageBonus: '', rangeShort: '', rangeMedium: '', rangeLong: '', slow: false, twoHanded: false },
      weaponEffects: [], weaponRollTables: [], armourStats: { armourClass: '', shieldMod: '', magicMod: '', armourType: 'body' },
      consumableStats: { useMode: 'consume', effectText: '' }, specialRule: '', notes: '', goldAmount: 47,
      droppedByCharacterId: 'pc', droppedByCharacterName: 'Ada', createdAt: 'server-time', updatedAt: 'server-time',
    })
  })
  it('propagates rejection after starting all writes, without retries or rollback writes', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('denied'))
    const item = makeDroppedGoldCampaignItem(1, 'pc', 'Ada', 'first')
    await expect(writeDroppedOverflow(db, 'c', 'g', [item, { ...item, id: 'second' }], 3, 'pc', 'Ada')).rejects.toThrow('denied')
    expect(mocks.setDoc).toHaveBeenCalledTimes(3)
    expect(mocks.setDoc.mock.calls.map(([ref]) => ref.path)).toEqual([
      'groups/g/campaigns/c/items/first', 'groups/g/campaigns/c/items/second', expect.stringMatching(/^groups\/g\/campaigns\/c\/items\/[^/]+$/),
    ])
    expect(mocks.setDoc.mock.calls[2][1]).toMatchObject({ type: 'gold', goldAmount: 3 })
  })
})
