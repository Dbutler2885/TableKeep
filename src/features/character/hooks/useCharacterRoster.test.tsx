// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ createCharacter: vi.fn(), makeId: vi.fn(() => 'new-pc') }))
vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  serverTimestamp: () => 'server-time',
}))
vi.mock('../characterFactories', () => ({ makeId: mocks.makeId }))
const { useCharacterRoster } = await import('./useCharacterRoster')
const { newCharacterStoreFields } = await import('../characterStore/characterStoreWrites')
const { oseCharacterStore } = await import('../lib/storedCharacterRecord')

function setup(overrides: Partial<Parameters<typeof useCharacterRoster>[0]> = {}) {
  const params: Parameters<typeof useCharacterRoster>[0] = {
    campaignId: 'c', groupId: 'g', currentUserId: 'player', currentUsername: 'player1',
    canCreateCharacter: true, effectiveSelected: null, canEditSelected: true,
    isGuidedCreation: true, isInFinalizationFlow: true, hasRolledAbilityScores: false,
    hasRolledHp: false, selectedInventory: [], setSelectedCharacterId: vi.fn(),
    isSinglePane: true, showDetailPane: vi.fn(), updateSelectedCharacter: vi.fn(), createCharacter: mocks.createCharacter, ...overrides,
  }
  return { params, ...renderHook(() => useCharacterRoster(params)) }
}
beforeEach(() => { vi.clearAllMocks(); mocks.createCharacter.mockResolvedValue(undefined) })
afterEach(() => cleanup())

describe('OSE creation', () => {
  it.each(['new', 'established'] as const)('creates a %s sheet with precisely the existing defaults, stamped with the current version, with no system and no details', (creationMode) => {
    const { result, params } = setup()
    act(() => result.current.addCharacter(creationMode))
    expect(params.setSelectedCharacterId).toHaveBeenCalledExactlyOnceWith('new-pc')
    expect(params.showDetailPane).toHaveBeenCalledTimes(1)
    expect(mocks.createCharacter).toHaveBeenCalledTimes(1)
    const [created] = mocks.createCharacter.mock.calls[0]
    expect(created.id).toBe('new-pc')
    // The shared store writes the serializer's output, under the record's own id.
    expect(newCharacterStoreFields(oseCharacterStore({ userId: 'player', currentUsername: 'player1' }), created)).toEqual({
      name: 'New Character', ownerUserId: 'player', ownerUsername: 'player1', creationMode, creationModeExplicit: true,
      creationStatus: creationMode === 'new' ? 'draft' : 'established_draft', class: '-', level: 1,
      hpCurrent: 0, hpMax: 0, ac: 10, xp: 0, portraitPath: '', portraitFocusX: 50, portraitFocusY: 50,
      tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 }, details: null, schemaVersion: 1, schemaWrittenAt: 'server-time',
      createdAt: 'server-time', updatedAt: 'server-time',
    })
    expect(vi.mocked(params.setSelectedCharacterId).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(params.showDetailPane).mock.invocationCallOrder[0])
    expect(vi.mocked(params.showDetailPane).mock.invocationCallOrder[0]).toBeLessThan(mocks.createCharacter.mock.invocationCallOrder[0])
  })

  it('does nothing when creation is forbidden', () => {
    const { result, params } = setup({ canCreateCharacter: false })
    act(() => result.current.addCharacter('new'))
    expect(mocks.makeId).not.toHaveBeenCalled()
    expect(mocks.createCharacter).not.toHaveBeenCalled()
    expect(params.setSelectedCharacterId).not.toHaveBeenCalled()
  })

  it('does not change panes on a wide layout, and leaves selection changed after a rejected fire-and-forget write', async () => {
    const failure = Promise.reject(new Error('permission denied'))
    // Observe the rejection here: addCharacter returns void and attaches no handler.
    const observed = failure.catch((error: Error) => error.message)
    mocks.createCharacter.mockReturnValueOnce(failure)
    const { result, params } = setup({ isSinglePane: false })
    let returned: unknown
    act(() => { returned = result.current.addCharacter('new') })
    expect(returned).toBeUndefined()
    expect(await observed).toBe('permission denied')
    expect(params.setSelectedCharacterId).toHaveBeenCalledExactlyOnceWith('new-pc')
    expect(params.showDetailPane).not.toHaveBeenCalled()
    expect(params.updateSelectedCharacter).not.toHaveBeenCalled()
  })
})
