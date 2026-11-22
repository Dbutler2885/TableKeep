// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CharacterRecord, TransferableInventoryItem } from '../../types/app'
const mocks = vi.hoisted(() => ({ next: null as null | ((snap: unknown) => void), set: vi.fn(), remove: vi.fn(), callable: vi.fn(), stop: vi.fn() }))
vi.mock('../../firebase', () => ({ db: {}, functions: {} }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }), doc: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (_ref: unknown, next: (snap: unknown) => void) => { mocks.next = next; return mocks.stop },
  serverTimestamp: () => 'server-time', setDoc: mocks.set, deleteDoc: mocks.remove,
}))
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.callable }))
const { usePendingTransfers } = await import('./usePendingTransfers')
const item = { id: 'rope', kind: 'general', name: 'Rope', typeName: 'Rope', qty: 1 } as TransferableInventoryItem
const sender = { id: 'sender', name: 'Sender', ownerUserId: 'from' }
const receiver = { id: 'receiver', name: 'Receiver', ownerUserId: 'to' }
const offer = { itemSnapshot: item, itemId: 'rope', fromCharacterId: 'sender', fromCharacterName: 'Sender', fromUserId: 'from', toCharacterId: 'receiver', toCharacterName: 'Receiver', toUserId: 'to', createdAt: { seconds: 10 } }
const render = (role: 'gm' | 'player' = 'player', campaign: string | null = 'c') => renderHook(() => usePendingTransfers(campaign, 'g', role, 'to'))
beforeEach(() => { vi.clearAllMocks(); mocks.set.mockResolvedValue(undefined); mocks.remove.mockResolvedValue(undefined); mocks.callable.mockResolvedValue({ data: { ok: true } }) })
afterEach(() => cleanup())
it('parses valid offers, sorts them, and selects incoming/outgoing and the GM list', () => {
  const view = render('gm')
  act(() => mocks.next?.({ docs: [{ id: 'late', data: () => offer }, { id: 'invalid', data: () => ({}) }, { id: 'early', data: () => ({ ...offer, fromUserId: 'to', toUserId: 'other', createdAt: {} }) }] }))
  expect(view.result.current.allTransfers.map((entry) => entry.id)).toEqual(['early', 'late'])
  expect(view.result.current.incomingTransfers.map((entry) => entry.id)).toEqual(['late'])
  expect(view.result.current.outgoingTransfers.map((entry) => entry.id)).toEqual(['early'])
  expect(view.result.current.incomingTransfers[0]).toMatchObject({ itemId: 'rope', itemName: 'Rope', toCharacterId: 'receiver' })
})
it('creates a complete offer under the group-scoped path', async () => {
  const view = render()
  await act(async () => view.result.current.createTransfer(item, 'original', sender as CharacterRecord, receiver as CharacterRecord))
  expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringMatching(/^groups\/g\/campaigns\/c\/pendingTransfers\//) }), expect.objectContaining({ itemId: 'original', itemSnapshot: item, fromCharacterId: 'sender', toCharacterId: 'receiver', fromUserId: 'from', toUserId: 'to', createdAt: 'server-time' }))
})
it('rejects a same-character offer, an ownerless destination and a duplicate offer', async () => {
  const view = render()
  await expect(view.result.current.createTransfer(item, 'rope', sender as CharacterRecord, sender as CharacterRecord)).rejects.toThrow('different character')
  await expect(view.result.current.createTransfer(item, 'rope', sender as CharacterRecord, { ...receiver, ownerUserId: '' } as CharacterRecord)).rejects.toThrow('no owner')
  act(() => mocks.next?.({ docs: [{ id: 'offered', data: () => offer }] }))
  await expect(view.result.current.createTransfer(item, 'rope', sender as CharacterRecord, receiver as CharacterRecord)).rejects.toThrow('already offered to Receiver')
  expect(mocks.set).not.toHaveBeenCalled()
})
it('accepts through the scoped callable and deletes declined/cancelled offers', async () => {
  const view = render()
  await view.result.current.acceptTransfer('offer')
  expect(mocks.callable).toHaveBeenCalledWith({ groupId: 'g', campaignId: 'c', transferId: 'offer' })
  await view.result.current.declineTransfer('declined'); await view.result.current.cancelTransfer('cancelled')
  expect(mocks.remove.mock.calls.map(([ref]) => ref.path)).toEqual(['groups/g/campaigns/c/pendingTransfers/declined', 'groups/g/campaigns/c/pendingTransfers/cancelled'])
})
it('surfaces callable failures and refuses writes when the campaign is not ready', async () => {
  const view = render()
  mocks.callable.mockRejectedValue(new Error('no room'))
  await expect(view.result.current.acceptTransfer('offer')).rejects.toThrow('no room')
  const empty = render('player', null)
  await expect(empty.result.current.acceptTransfer('offer')).rejects.toThrow('Campaign not ready')
  await expect(empty.result.current.createTransfer(item, 'rope', sender as CharacterRecord, receiver as CharacterRecord)).rejects.toThrow('Campaign not ready')
  await empty.result.current.cancelTransfer('offer')
  expect(empty.result.current.allTransfers).toEqual([])
})

it('retains offer identity for a player retry after the accepted offer disappears from the listener', async () => {
  const view = render()
  act(() => mocks.next?.({ docs: [{ id: 'retained-offer', data: () => offer }] }))
  await view.result.current.acceptTransfer('retained-offer')
  act(() => mocks.next?.({ docs: [] }))
  await view.result.current.acceptTransfer('retained-offer')
  const expected = { groupId: 'g', campaignId: 'c', transferId: 'retained-offer', fromCharacterId: 'sender', toCharacterId: 'receiver' }
  expect(mocks.callable).toHaveBeenNthCalledWith(1, expected)
  expect(mocks.callable).toHaveBeenNthCalledWith(2, expected)
})
