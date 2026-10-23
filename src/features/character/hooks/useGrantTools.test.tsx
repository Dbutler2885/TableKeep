// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseOseCharacter } from '../lib/storedCharacterRecord'

const mocks = vi.hoisted(() => ({ runTransaction: vi.fn(), get: vi.fn(), set: vi.fn() }))
vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  doc: (parent: { path?: string }, ...segments: string[]) => {
    const path = [parent.path, ...segments].filter(Boolean).join('/')
    return { path, id: path.split('/').at(-1), parent: { parent: { path: path.split('/').slice(0, -2).join('/') } } }
  },
  runTransaction: mocks.runTransaction, serverTimestamp: () => 'server-time',
}))
const { useGrantTools } = await import('./useGrantTools')
const characters = ['a', 'b'].map((id) => parseOseCharacter(id, { name: id.toUpperCase(), class: 'Fighter', xp: 0 }))
function setup(overrides: Partial<Parameters<typeof useGrantTools>[0]> = {}) {
  const params: Parameters<typeof useGrantTools>[0] = {
    campaignId: 'c', groupId: 'g', grantMode: true, setGrantMode: vi.fn(), setActivePage: vi.fn(), setPaneView: vi.fn(),
    isSinglePane: false, canGrant: true, sortedCharacters: characters, campaignItems: [], abilityScoresByCharacterId: {},
    setInventoryByCharacterId: vi.fn(), syncCharacterLocal: vi.fn(), ...overrides,
  }
  return { params, ...renderHook(() => useGrantTools(params)) }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.get.mockResolvedValue({ exists: () => true, data: () => ({ schemaVersion: 1, xp: 100, details: { inventory: [] } }) })
  mocks.runTransaction.mockImplementation(async (_db, body) => body(mocks))
})
afterEach(() => cleanup())

describe('GM grant panel write orchestration', () => {
  it('requires permission, selected targets and some grant content', async () => {
    const denied = setup({ canGrant: false })
    await act(() => denied.result.current.applyGrantToSelectedTargets())
    expect(denied.result.current.grantFeedback).toBeNull()
    const allowed = setup()
    await act(() => allowed.result.current.applyGrantToSelectedTargets())
    expect(allowed.result.current.grantFeedback).toBe('Select at least one target.')
    act(() => allowed.result.current.selectAllGrantTargets())
    await act(() => allowed.result.current.applyGrantToSelectedTargets())
    expect(allowed.result.current.grantFeedback).toBe('Add XP, gp, or items before granting.')
    expect(mocks.runTransaction).not.toHaveBeenCalled()
  })

  it('grants split remainders in roster order using one transaction per character, then syncs local state and clears the draft', async () => {
    const { result, params } = setup()
    act(() => {
      result.current.toggleGrantTarget('b', true)
      result.current.toggleGrantTarget('a', true)
      result.current.setGrantXpBase('7')
      result.current.setGrantGoldGp('5')
      result.current.setGrantXpSplitBetweenTargets(true)
      result.current.setGrantGoldSplitBetweenTargets(true)
      result.current.setGrantNote('This note is not persisted')
    })
    await act(() => result.current.applyGrantToSelectedTargets())
    expect(mocks.set.mock.calls.map(([ref, fields, options]) => [ref.path, fields.xp, fields.details.inventory.map((i: { qty: number }) => i.qty), options])).toEqual([
      ['groups/g/campaigns/c/characters/a', 104, [3], { merge: true }],
      ['groups/g/campaigns/c/characters/b', 103, [2], { merge: true }],
    ])
    expect(mocks.set.mock.calls.map(([, fields]) => Object.keys(fields).sort())).toEqual([
      ['details', 'schemaVersion', 'schemaWrittenAt', 'updatedAt', 'xp'], ['details', 'schemaVersion', 'schemaWrittenAt', 'updatedAt', 'xp'],
    ])
    expect(mocks.runTransaction).toHaveBeenCalledTimes(2)
    expect(mocks.set.mock.invocationCallOrder[0]).toBeLessThan(mocks.get.mock.invocationCallOrder[1])
    expect(vi.mocked(params.syncCharacterLocal).mock.calls).toEqual([['a', { xp: 104 }], ['b', { xp: 103 }]])
    let local = {}
    for (const [update] of vi.mocked(params.setInventoryByCharacterId).mock.calls) local = typeof update === 'function' ? update(local) : update
    expect(local).toMatchObject({ a: [{ kind: 'gold', qty: 3 }], b: [{ kind: 'gold', qty: 2 }] })
    expect(result.current.grantFeedback).toBe('Granted to 2 characters • 7 base XP • 5 gp • XP split • gp split')
    expect(result.current.grantXpBase).toBe('')
    expect(result.current.grantGoldGp).toBe('')
    expect(result.current.grantNote).toBe('')
    expect(result.current.grantTargetIds).toEqual({})
    expect(result.current.grantBusy).toBe(false)
  })

  it('keeps an earlier target committed and synced when a later target fails, retaining the draft and targets', async () => {
    mocks.runTransaction.mockImplementationOnce(async (_db, body) => body(mocks)).mockRejectedValueOnce(new Error('permission denied'))
    const { result, params } = setup()
    act(() => { result.current.selectAllGrantTargets(); result.current.setGrantXpBase('10') })
    await act(() => result.current.applyGrantToSelectedTargets())
    expect(mocks.set).toHaveBeenCalledTimes(1)
    expect(params.syncCharacterLocal).toHaveBeenCalledExactlyOnceWith('a', { xp: 110 })
    expect(result.current.grantFeedback).toBe('Grant failed: permission denied')
    expect(result.current.grantXpBase).toBe('10')
    expect(result.current.selectedGrantTargetIds).toEqual(['a', 'b'])
    expect(result.current.grantBusy).toBe(false)
  })

  it('refuses a target not yet at the current version with the plain message, keeping earlier targets granted', async () => {
    mocks.get
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ schemaVersion: 1, xp: 100, details: { inventory: [] } }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ xp: 100, details: { inventory: [] } }) })
    const { result, params } = setup()
    act(() => { result.current.selectAllGrantTargets(); result.current.setGrantXpBase('10') })
    await act(() => result.current.applyGrantToSelectedTargets())
    expect(mocks.set).toHaveBeenCalledTimes(1)
    expect(params.syncCharacterLocal).toHaveBeenCalledExactlyOnceWith('a', { xp: 110 })
    expect(result.current.grantFeedback).toBe('Grant failed: This character is being updated. Try again in a minute.')
    expect(result.current.selectedGrantTargetIds).toEqual(['a', 'b'])
  })

  it('reports overflow from the actual grant writer and includes an item grant in feedback', async () => {
    const { result } = setup()
    act(() => {
      result.current.toggleGrantTarget('a', true)
      result.current.setGrantTemplateEntries([{ key: 'gear-rope', name: 'Rope', kind: 'general', costGp: 1, qty: 14 }])
    })
    await act(() => result.current.applyGrantToSelectedTargets())
    expect(mocks.set).toHaveBeenCalledTimes(2)
    expect(result.current.grantFeedback).toContain('Granted to 1 character • items | Overflow: A: Not all items fit')
    expect(result.current.grantTemplateEntries).toEqual([])
  })

  it('reports a non-Error transaction rejection and releases the busy state', async () => {
    mocks.runTransaction.mockRejectedValue('offline')
    const { result } = setup()
    act(() => { result.current.selectAllGrantTargets(); result.current.setGrantGoldGp('1') })
    await act(() => result.current.applyGrantToSelectedTargets())
    expect(result.current.grantFeedback).toBe('Grant failed: Unknown error')
    expect(result.current.grantBusy).toBe(false)
  })
})
