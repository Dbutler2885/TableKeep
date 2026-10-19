import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VtmCharacterActionContext } from './vtmCharacterActions'
import type { VtmCharacterRecord } from './vtmTypes'

const mocks = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('./vtmCharacterWrites', () => ({
  createVtmCharacterDoc: mocks.create, deleteVtmCharacterDoc: vi.fn(), saveCurrentVtmCharacter: vi.fn(), scheduleVtmCharacterSave: vi.fn(),
}))
const { addVtmCharacter } = await import('./vtmCharacterActions')
function context(overrides: Partial<VtmCharacterActionContext> = {}): VtmCharacterActionContext {
  return {
    campaign: { groupId: 'g', campaignId: 'c' }, role: 'player', userId: 'player', currentUsername: 'player1',
    charactersRef: { current: [] }, savesRef: { current: { pending: {}, inFlight: {} } },
    setCharacters: vi.fn(), setSelectedCharacterId: vi.fn(), setCurrentCharacterId: vi.fn(), ...overrides,
  }
}
beforeEach(() => { vi.resetAllMocks(); mocks.create.mockResolvedValue(undefined) })

describe('VtM create action', () => {
  it.each(['new', 'established'] as const)('selects and appends a %s character before awaiting the write, without setting current character', async (mode) => {
    const ctx = context()
    await addVtmCharacter(ctx, mode)
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(ctx.campaign, expect.objectContaining({
      system: 'vtm', ownerUserId: 'player', ownerUsername: 'player1', creationMode: mode,
      creationModeExplicit: true, creationStatus: mode === 'new' ? 'draft' : 'established_draft',
    }))
    const character = mocks.create.mock.calls[0][1] as VtmCharacterRecord
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
    await addVtmCharacter(ctx, 'new')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(ctx.setCharacters).not.toHaveBeenCalled()
    expect(ctx.setSelectedCharacterId).not.toHaveBeenCalled()
  })

  it('propagates a failed create without rolling back optimistic state', async () => {
    mocks.create.mockRejectedValue(new Error('permission denied'))
    const ctx = context()
    await expect(addVtmCharacter(ctx, 'new')).rejects.toThrow('permission denied')
    expect(ctx.setCharacters).toHaveBeenCalledTimes(1)
    expect(ctx.setSelectedCharacterId).toHaveBeenCalledTimes(1)
  })
})
