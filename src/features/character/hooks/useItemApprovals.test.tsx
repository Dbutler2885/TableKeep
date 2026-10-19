// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterInventoryItem, ItemApprovalRequest } from '../../../types/app'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), update: vi.fn(),
  runTransaction: vi.fn(), updateDoc: vi.fn(),
}))
vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  query: (ref: unknown) => ref,
  where: vi.fn(), onSnapshot: () => () => undefined,
  serverTimestamp: () => 'server-time',
  runTransaction: mocks.runTransaction, updateDoc: mocks.updateDoc,
}))
const { useItemApprovals } = await import('./useItemApprovals')
const path = 'groups/g/campaigns/c'
const charRef = { path: `${path}/characters/pc` }
const approvalRef = { path: `${path}/itemApprovals/request` }
const resolved = { status: 'approved', resolvedAt: 'server-time' }
const rope = { id: 'rope', kind: 'general', name: 'Rope', qty: 1, equipped: false, costGp: 3 } as CharacterInventoryItem
const request = (action: ItemApprovalRequest['action'], fields: Partial<ItemApprovalRequest> = {}): ItemApprovalRequest => ({
  id: 'request', action, characterId: 'pc', characterName: 'Ada', campaignId: 'c',
  requestedByUserId: 'player', requestedByUsername: 'player1', status: 'pending', createdAt: 'requested-at', ...fields,
})
function stored(data: Record<string, unknown> = {}) {
  mocks.get.mockResolvedValue({ exists: () => true, data: () => data })
}
function approval(campaign: string | null = 'c', group: string | null = 'g') {
  return renderHook(() => useItemApprovals(campaign, group, 'gm', 'gm')).result
}
async function approve(action: ItemApprovalRequest['action'], fields: Partial<ItemApprovalRequest> = {}) {
  const result = approval()
  await act(() => result.current.approveRequest(request(action, fields)))
}
function expectCharacterWrite(details: Record<string, unknown>) {
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(charRef)
  expect(mocks.set).toHaveBeenCalledExactlyOnceWith(charRef, { details }, { merge: true })
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(approvalRef, resolved)
  expect(mocks.get.mock.invocationCallOrder[0]).toBeLessThan(mocks.set.mock.invocationCallOrder[0])
  expect(mocks.set.mock.invocationCallOrder[0]).toBeLessThan(mocks.update.mock.invocationCallOrder[0])
}

beforeEach(() => {
  vi.resetAllMocks()
  stored()
  mocks.runTransaction.mockImplementation(async (_db, body) => body(mocks))
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('approval character writes before version stamping', () => {
  it.each([undefined, 0, 1, 2])('create appends an item even at stored schema version %s, keeping unknown and legacy details', async (schemaVersion) => {
    const details = { inventory: [rope], weapons: ['old sword'], acManualOverride: true, future: { kept: true } }
    stored({ ...(schemaVersion === undefined ? {} : { schemaVersion }), details })
    await approve('create', { item: { ...rope, id: 'new' } })
    expectCharacterWrite({ ...details, inventory: [rope, { ...rope, id: 'new' }] })
  })

  it.each([null, 'invalid', { inventory: 'invalid' }])('create defaults malformed details/inventory: %j', async (details) => {
    stored({ details })
    await approve('create', { item: rope })
    expectCharacterWrite({ ...(typeof details === 'object' ? details : {}), inventory: [rope] })
  })

  it('create does not check capacity or whether the same item was already approved', async () => {
    const inventory = Array.from({ length: 20 }, (_, i) => ({ ...rope, id: String(i) }))
    stored({ details: { inventory } })
    await approve('create', { item: rope })
    expectCharacterWrite({ inventory: [...inventory, rope] })
  })

  it.each(['create', 'sell'] as const)('%s without an item is a no-op', async (action) => {
    await approve(action)
    expect(mocks.runTransaction).not.toHaveBeenCalled()
    expect(mocks.updateDoc).not.toHaveBeenCalled()
  })

  it('sell marks a missing item approved without touching the character', async () => {
    stored({ details: { inventory: [] } })
    await approve('sell', { item: rope })
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(approvalRef, resolved)
  })

  it.each([0, -4, Number.NaN])('sell for %s gp removes all matching ids without adding gold', async (costGp) => {
    stored({ details: { inventory: [rope, rope, { ...rope, id: 'other' }], notes: 'keep' } })
    await approve('sell', { item: { ...rope, costGp } })
    expectCharacterWrite({ inventory: [{ ...rope, id: 'other' }], notes: 'keep' })
  })

  it('sell uses the request price, floors it, combines gold and preserves other detail fields', async () => {
    const gold = { id: 'gold', kind: 'gold', qty: 99, equipped: false }
    stored({ details: { inventory: [rope, gold], abilityScores: { STR: '10' }, unknown: true } })
    await approve('sell', { item: { ...rope, costGp: 4.8 } })
    const inventory = mocks.set.mock.calls[0][1].details.inventory
    expect(inventory).toMatchObject([{ kind: 'gold', qty: 100 }, { kind: 'gold', qty: 3 }])
    expect(inventory[0].id).not.toBe('gold')
    expectCharacterWrite({ inventory, abilityScores: { STR: '10' }, unknown: true })
  })

  it('sell silently loses overflow proceeds, without creating dropped item documents', async () => {
    const packed = Array.from({ length: 13 }, (_, i) => ({ ...rope, id: `packed-${i}` }))
    stored({ details: { inventory: [...packed, rope] } })
    await approve('sell', { item: { ...rope, costGp: 101 } })
    expectCharacterWrite({ inventory: packed })
  })

  it('learn spell filters nonstrings and deduplicates incoming ids, retaining existing duplicates', async () => {
    stored({ details: { spellBookSpellIds: ['sleep', 4, 'sleep'], notes: 'keep' } })
    await approve('learn_spell', { spellIds: ['sleep', 'light', 'light', 7] as unknown as string[] })
    expectCharacterWrite({ spellBookSpellIds: ['sleep', 'sleep', 'light'], notes: 'keep' })
  })

  it.each([undefined, [], [7]])('learn spell with no valid ids (%j) resolves without even reading the character', async (spellIds) => {
    await approve('learn_spell', { spellIds: spellIds as string[] | undefined })
    expect(mocks.runTransaction).not.toHaveBeenCalled()
    expect(mocks.updateDoc).toHaveBeenCalledExactlyOnceWith(approvalRef, resolved)
  })

  it.each([null, 'bad', { spellBookSpellIds: 'bad', future: true }])('learn spell supplies missing list defaults for %j', async (details) => {
    stored({ details })
    await approve('learn_spell', { spellIds: ['light'] })
    expectCharacterWrite({ ...(typeof details === 'object' ? details : {}), spellBookSpellIds: ['light'] })
  })

  it.each(['active', 'established_draft', undefined])('ability reroll for %s resolves without a character write', async (creationStatus) => {
    stored({ creationStatus })
    await approve('ability_reroll')
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(approvalRef, resolved)
  })

  it.each([null, { future: true }])('ability reroll replaces all six scores with 3d6 and preserves details %j', async (details) => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    stored({ creationStatus: 'draft', details })
    await approve('ability_reroll')
    const scores = { STR: '3', INT: '3', WIS: '3', DEX: '3', CON: '3', CHA: '3' }
    expectCharacterWrite({ ...details, abilityScores: scores, rolledAbilityScores: scores, abilityScoresRolled: true })
    expect(random).toHaveBeenCalledTimes(18)
  })

  it.each(['create', 'sell', 'learn_spell', 'ability_reroll'] as const)('%s fails on a missing character before any write', async (action) => {
    mocks.get.mockResolvedValue({ exists: () => false })
    await expect(approve(action, { item: rope, spellIds: ['light'] })).rejects.toThrow('Character not found')
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['create', 'sell', 'learn_spell', 'ability_reroll'] as const)('%s propagates a transaction failure', async (action) => {
    mocks.runTransaction.mockRejectedValue(new Error('permission denied'))
    await expect(approve(action, { item: rope, spellIds: ['light'] })).rejects.toThrow('permission denied')
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([[null, 'g'], ['c', null]])('all approval writers need campaign %s and group %s', async (campaign, group) => {
    const result = approval(campaign, group)
    for (const action of ['create', 'sell', 'learn_spell', 'ability_reroll'] as const) {
      await act(() => result.current.approveRequest(request(action, { item: rope, spellIds: ['light'] })))
    }
    expect(mocks.runTransaction).not.toHaveBeenCalled()
    expect(mocks.updateDoc).not.toHaveBeenCalled()
  })
})
