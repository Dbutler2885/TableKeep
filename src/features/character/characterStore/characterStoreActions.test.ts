import { describe, expect, it, vi } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import { oseCharacterStore, readStoredCharacter } from '../lib/storedCharacterRecord'
import { makeVtmCharacter } from '../vtmDefaults'

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))

const {
  canChooseCharacterStoreCharacter,
  canEditCharacterStoreCharacter,
  syncCharacterStoreCharacterLocal,
  updateCharacterStoreCharacter,
} = await import('./characterStoreActions')
const { emptyCharacterStoreSaves } = await import('./characterStoreWrites')

const owned = { ...makeVtmCharacter('user-1', 'player1'), id: 'a' }

describe('canEditCharacterStoreCharacter', () => {
  it('lets the GM edit any character and a player only their own', () => {
    expect(canEditCharacterStoreCharacter(owned, 'gm', 'gm-1')).toBe(true)
    expect(canEditCharacterStoreCharacter(owned, 'player', 'user-1')).toBe(true)
    expect(canEditCharacterStoreCharacter(owned, 'player', 'user-2')).toBe(false)
    expect(canEditCharacterStoreCharacter(owned, null, 'user-2')).toBe(false)
    expect(canEditCharacterStoreCharacter(undefined, 'gm', 'gm-1')).toBe(false)
  })
})

describe('canChooseCharacterStoreCharacter', () => {
  it('stops only a player choosing someone else\'s character', () => {
    expect(canChooseCharacterStoreCharacter(owned, 'gm', 'gm-1')).toBe(true)
    expect(canChooseCharacterStoreCharacter(owned, 'player', 'user-1')).toBe(true)
    expect(canChooseCharacterStoreCharacter(owned, 'player', 'user-2')).toBe(false)
    expect(canChooseCharacterStoreCharacter(undefined, 'gm', 'gm-1')).toBe(false)
  })
})

describe('editing a character', () => {
  const viewer = { userId: 'user-1', currentUsername: 'player1' }
  const contextFor = (characters: CharacterRecord[]) => ({
    ruleSet: oseCharacterStore(viewer),
    campaign: null,
    role: 'player' as const,
    userId: 'user-1',
    charactersRef: { current: characters },
    savesRef: { current: emptyCharacterStoreSaves() },
    setCharacters: vi.fn(),
    setSelectedCharacterId: vi.fn(),
    setCurrentCharacterId: vi.fn(),
  })
  const pc = readStoredCharacter('a', { ownerUserId: 'user-1', hpCurrent: 6, hpMax: 10 }, viewer)

  it('applies an edit as the rule set adjusts it, but saves nothing without a campaign', () => {
    vi.useFakeTimers()
    const context = contextFor([pc])

    updateCharacterStoreCharacter(context, 'a', { name: 'Edited', hpCurrent: 15 })
    vi.advanceTimersByTime(500)

    expect(context.charactersRef.current[0]).toMatchObject({ name: 'Edited', hpCurrent: 10 })
    expect(context.setCharacters).toHaveBeenCalledWith(context.charactersRef.current)
    expect(context.savesRef.current).toEqual({ pending: {}, inFlight: {} })
    vi.useRealTimers()
  })

  it('changes only the local copy of a sync, for anyone\'s character, without adjusting it', () => {
    const theirs = { ...pc, ownerUserId: 'user-2' }
    const context = contextFor([theirs])

    syncCharacterStoreCharacterLocal(context, 'a', { hpCurrent: 15 })
    const update = context.setCharacters.mock.calls[0][0] as (current: CharacterRecord[]) => CharacterRecord[]

    expect(update([theirs])).toEqual([{ ...theirs, hpCurrent: 15 }])
    expect(context.charactersRef.current).toEqual([theirs])
  })
})
