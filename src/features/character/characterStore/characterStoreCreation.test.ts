import { beforeEach, describe, expect, it, vi } from 'vitest'
import { vtmCharacterStore } from '../vtmCharacterRecord'
import { makeVtmCharacter } from '../vtmDefaults'
import type { VtmCharacterRecord } from '../vtmTypes'
import type { CharacterStoreActionContext } from './characterStoreActions'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('./characterStoreWrites', () => ({
  createCharacterStoreDoc: mocks.create, deleteCharacterStoreDoc: vi.fn(), saveCharacterStoreCurrentCharacter: vi.fn(), scheduleCharacterStoreSave: vi.fn(),
}))
const { addCharacterStoreCharacter } = await import('./characterStoreActions')
function context(overrides: Partial<CharacterStoreActionContext<VtmCharacterRecord>> = {}): CharacterStoreActionContext<VtmCharacterRecord> {
  return {
    ruleSet: vtmCharacterStore, campaign: { groupId: 'g', campaignId: 'c' }, role: 'player', userId: 'player',
    charactersRef: { current: [] }, savesRef: { current: { pending: {}, inFlight: {} } },
    setCharacters: vi.fn(), setSelectedCharacterId: vi.fn(), setCurrentCharacterId: vi.fn(), ...overrides,
  }
}
beforeEach(() => { vi.resetAllMocks(); mocks.create.mockResolvedValue(undefined) })

describe('character store create action', () => {
  it.each(['new', 'established'] as const)('selects and appends a %s character before awaiting the write, without setting current character', async (mode) => {
    const ctx = context()
    const character = makeVtmCharacter('player', 'player1', mode)
    await addCharacterStoreCharacter(ctx, character)
    // The caller's record goes to the write as made, under the id it carries.
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(ctx.campaign, vtmCharacterStore, character)
    expect(ctx.setSelectedCharacterId).toHaveBeenCalledExactlyOnceWith(character.id)
    const update = vi.mocked(ctx.setCharacters).mock.calls[0][0] as (current: VtmCharacterRecord[]) => VtmCharacterRecord[]
    const previous = { ...character, id: 'old' }
    expect(update([previous])).toEqual([previous, character])
    expect(vi.mocked(ctx.setSelectedCharacterId).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(ctx.setCharacters).mock.invocationCallOrder[0])
    expect(vi.mocked(ctx.setCharacters).mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0])
    expect(ctx.setCurrentCharacterId).not.toHaveBeenCalled()
  })

  it.each([{ campaign: null }, { role: null }] as const)('does nothing with missing scope or role: %j', async (overrides) => {
    const ctx = context(overrides)
    await addCharacterStoreCharacter(ctx, makeVtmCharacter('player', 'player1'))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(ctx.setCharacters).not.toHaveBeenCalled()
    expect(ctx.setSelectedCharacterId).not.toHaveBeenCalled()
  })

  it('propagates a failed create without rolling back optimistic state', async () => {
    mocks.create.mockRejectedValue(new Error('permission denied'))
    const ctx = context()
    await expect(addCharacterStoreCharacter(ctx, makeVtmCharacter('player', 'player1'))).rejects.toThrow('permission denied')
    expect(ctx.setCharacters).toHaveBeenCalledTimes(1)
    expect(ctx.setSelectedCharacterId).toHaveBeenCalledTimes(1)
  })
})
