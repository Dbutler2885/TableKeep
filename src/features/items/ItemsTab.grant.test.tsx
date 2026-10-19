// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampaignItem, CharacterInventoryItem } from '../../types/app'
import { parseOseCharacter } from '../character/lib/storedCharacterRecord'

const mocks = vi.hoisted(() => ({ items: [] as CampaignItem[], get: vi.fn(), set: vi.fn(), delete: vi.fn(), runTransaction: vi.fn() }))
vi.mock('../../firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  doc: (_db: unknown, path: string) => ({ path }),
  serverTimestamp: () => 'server-time', runTransaction: mocks.runTransaction,
}))
vi.mock('./useItems', async (original) => ({
  ...await original<typeof import('./useItems')>(),
  useItems: () => ({ items: mocks.items, addItem: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn() }),
}))
const { ItemsTab } = await import('./ItemsTab')
const { makeDroppedGoldCampaignItem } = await import('../character/inventoryOverflow')
const path = 'groups/g/campaigns/c'
const charRef = { path: `${path}/characters/pc` }
const character = parseOseCharacter('pc', { name: 'Ada', class: 'Fighter' })
const rope = { id: 'rope', kind: 'general', typeId: 'custom', typeName: 'Rope', name: 'Rope', qty: 1, equipped: false, costGp: 1 } as CharacterInventoryItem
function source(overrides: Partial<CampaignItem> = {}): CampaignItem {
  return { ...makeDroppedGoldCampaignItem(50, 'source-pc', 'Source', 'source'), status: 'authored', ...overrides }
}
// A stored character at OSE's current version, unless the data names another.
function stored(data: Record<string, unknown>) {
  mocks.get.mockResolvedValue({ exists: () => true, data: () => ({ schemaVersion: 1, ...data }) })
}
function mount(item: CampaignItem, role: 'gm' | 'player' = 'gm') {
  mocks.items = [item]
  render(<ItemsTab campaignId="c" groupId="g" role={role} characters={[character]} />)
  if (item.status === 'dropped') fireEvent.click(screen.getByRole('button', { name: /Dropped/ }))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${item.typeName}`) }))
  const section = screen.queryByRole('heading', { name: 'Grant to Character' })?.closest('section')
  if (section) fireEvent.change(within(section).getByRole('combobox'), { target: { value: 'pc' } })
}
async function grant() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Grant item to selected character' })) })
}
function expectCharacterWrite(inventory: unknown[], details: Record<string, unknown> = {}) {
  expect(mocks.set.mock.calls[0]).toEqual([charRef, { details: { ...details, inventory }, schemaVersion: 1, schemaWrittenAt: 'server-time' }, { merge: true }])
  expect(mocks.get).toHaveBeenCalledExactlyOnceWith(charRef)
  expect(mocks.get.mock.invocationCallOrder[0]).toBeLessThan(mocks.set.mock.invocationCallOrder[0])
}
beforeEach(() => {
  vi.resetAllMocks()
  stored({ details: { inventory: [] } })
  mocks.runTransaction.mockImplementation(async (_db, body) => body(mocks))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('Items tab character grants', () => {
  it('adds a non-gold item at the current version, preserving unknown details, and stamps it', async () => {
    const details = { inventory: [rope], unknown: true }
    stored({ details, schemaWrittenAt: 'old-stamp' })
    mount(source({ type: 'general', typeId: 'custom', typeName: 'Lantern', name: 'Lantern' }))
    await grant()
    const inventory = mocks.set.mock.calls[0][1].details.inventory
    expect(inventory).toMatchObject([rope, { kind: 'general', name: 'Lantern' }])
    expectCharacterWrite(inventory, details)
    expect(mocks.set).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Granted "Lantern" to Ada')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Grant item to selected character' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it.each([null, 'invalid', { inventory: 'invalid', future: true }])('defaults missing or malformed details %j', async (details) => {
    stored({ details })
    mount(source())
    await grant()
    const inventory = mocks.set.mock.calls[0][1].details.inventory
    expect(inventory).toMatchObject([{ kind: 'gold', qty: 50 }])
    expectCharacterWrite(inventory, typeof details === 'object' && details !== null ? details : {})
  })

  it('reorders equipped and packed items before combined rechunked gold', async () => {
    const equipped = { ...rope, id: 'equipped', equipped: true }
    stored({ details: { inventory: [rope, { id: 'gold', kind: 'gold', qty: 80 }, equipped], abilityScores: { STR: '10' } } })
    mount(source({ goldAmount: 130 }))
    await grant()
    const inventory = mocks.set.mock.calls[0][1].details.inventory
    expect(inventory).toMatchObject([equipped, rope, { kind: 'gold', qty: 100 }, { kind: 'gold', qty: 100 }, { kind: 'gold', qty: 10 }])
    expect(mocks.set).toHaveBeenCalledTimes(1)
  })

  it('writes character before a non-gold overflow document, retaining the authored source', async () => {
    const packed = Array.from({ length: 13 }, (_, i) => ({ ...rope, id: `packed-${i}` }))
    stored({ details: { inventory: packed } })
    mount(source({ type: 'general', typeId: 'custom', typeName: 'Lantern', name: 'Lantern' }))
    await grant()
    expectCharacterWrite(packed)
    expect(mocks.set).toHaveBeenCalledTimes(2)
    expect(mocks.set.mock.calls[1][0].path).toMatch(new RegExp(`^${path}/items/`))
    expect(mocks.set.mock.calls[1][1]).toMatchObject({ status: 'dropped', type: 'general', createdAt: 'server-time', updatedAt: 'server-time' })
    expect(mocks.delete).not.toHaveBeenCalled()
    expect(screen.getByText(/Not all items fit/)).toBeTruthy()
  })

  it('creates a new dropped gold document for authored gold overflow', async () => {
    const packed = Array.from({ length: 12 }, (_, i) => ({ ...rope, id: `packed-${i}` }))
    stored({ details: { inventory: packed } })
    mount(source({ goldAmount: 150 }))
    await grant()
    expect(mocks.set.mock.calls[0][1].details.inventory).toMatchObject([...packed, { kind: 'gold', qty: 100 }])
    expect(mocks.set.mock.calls[1][1]).toMatchObject({ type: 'gold', goldAmount: 50, status: 'dropped', droppedByCharacterId: 'pc' })
    expect(mocks.set.mock.calls[1][0].path).not.toBe(`${path}/items/source`)
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it.each([0, 12, 13])('takes dropped gold with %s packed items, deleting the source only when fully accepted', async (count) => {
    const packed = Array.from({ length: count }, (_, i) => ({ ...rope, id: `packed-${i}` }))
    stored({ details: { inventory: packed } })
    mount(source({ status: 'dropped', goldAmount: 150 }))
    await grant()
    const sourceRef = { path: `${path}/items/source` }
    if (count === 0) {
      expect(mocks.set).toHaveBeenCalledTimes(1)
      expect(mocks.delete).toHaveBeenCalledExactlyOnceWith(sourceRef)
      expect(mocks.set.mock.invocationCallOrder[0]).toBeLessThan(mocks.delete.mock.invocationCallOrder[0])
    } else {
      expect(mocks.set).toHaveBeenCalledTimes(2)
      expect(mocks.set.mock.calls[1]).toEqual([sourceRef, { goldAmount: count === 12 ? 50 : 150, updatedAt: 'server-time' }, { merge: true }])
      expect(mocks.delete).not.toHaveBeenCalled()
    }
  })

  it('subtracts existing gold before calculating how much dropped source gold was accepted', async () => {
    const packed = Array.from({ length: 12 }, (_, i) => ({ ...rope, id: `packed-${i}` }))
    stored({ details: { inventory: [...packed, { id: 'old-gold', kind: 'gold', qty: 80 }] } })
    mount(source({ status: 'dropped', goldAmount: 150 }))
    await grant()
    expect(mocks.set.mock.calls[0][1].details.inventory).toMatchObject([...packed, { kind: 'gold', qty: 100 }])
    expect(mocks.set.mock.calls[1]).toEqual([{ path: `${path}/items/source` }, { goldAmount: 130, updatedAt: 'server-time' }, { merge: true }])
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('does not delete a dropped non-gold source after granting it', async () => {
    mount(source({ type: 'general', typeId: 'custom', typeName: 'Lantern', name: 'Lantern', status: 'dropped' }))
    await grant()
    expect(mocks.set).toHaveBeenCalledTimes(1)
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('defaults a missing gold amount to zero and clears success feedback after five seconds', async () => {
    vi.useFakeTimers()
    mount(source({ goldAmount: undefined }))
    await grant()
    expectCharacterWrite([])
    expect(screen.getByText('Granted 0 gp to Ada')).toBeTruthy()
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('Granted 0 gp to Ada')).toBeNull()
  })

  it('reports a missing character without making any transaction writes', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.get.mockResolvedValue({ exists: () => false })
    mount(source())
    await grant()
    expect(screen.getByText('Grant failed: Target character not found')).toBeTruthy()
    expect(mocks.set).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith('Grant item failed', expect.any(Error))
    expect((screen.getByRole('button', { name: 'Grant item to selected character' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it.each([undefined, 0, 2])('refuses a character at stored version %s with the plain message, writing nothing', async (schemaVersion) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    stored({ schemaVersion, details: { inventory: [rope], weapons: ['legacy'] } })
    mount(source({ status: 'dropped' }))
    await grant()
    expect(screen.getByText('Grant failed: This character is being updated. Try again in a minute.')).toBeTruthy()
    expect(mocks.set).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Grant item to selected character' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it.each([new Error('permission denied'), 'offline'])('reports transaction failure %s and releases busy state', async (error) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.runTransaction.mockRejectedValue(error)
    mount(source())
    await grant()
    expect(screen.getByText(`Grant failed: ${error instanceof Error ? error.message : 'Unknown error'}`)).toBeTruthy()
    expect(mocks.set).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: 'Grant item to selected character' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('does not offer grants to players', () => {
    mount(source(), 'player')
    expect(screen.queryByRole('button', { name: 'Grant item to selected character' })).toBeNull()
    expect(mocks.runTransaction).not.toHaveBeenCalled()
  })
})
