import { describe, expect, it, vi } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import {
  canChooseCharacter,
  canEditCharacter,
  clampHitPointUpdates,
  updateCharacter,
  type CharacterActionContext,
} from './characterActions'
import { emptyCharacterSaves } from './characterWrites'
import { readStoredCharacter } from './storedCharacterRecord'

const viewer = { userId: 'user-1', currentUsername: 'Player One' }
const character = (id: string, fields: Record<string, unknown> = {}): CharacterRecord =>
  readStoredCharacter(id, { ownerUserId: 'user-1', ...fields }, undefined, viewer)

describe('permissions', () => {
  const mine = character('mine')
  const theirs = character('theirs', { ownerUserId: 'user-2' })

  it('lets the GM edit anything and a player only their own', () => {
    expect(canEditCharacter(theirs, 'gm', 'user-1')).toBe(true)
    expect(canEditCharacter(mine, 'player', 'user-1')).toBe(true)
    expect(canEditCharacter(theirs, 'player', 'user-1')).toBe(false)
    expect(canEditCharacter(undefined, 'gm', 'user-1')).toBe(false)
  })

  it('lets only a player be stopped from choosing someone else\'s character', () => {
    expect(canChooseCharacter(theirs, 'gm', 'user-1')).toBe(true)
    expect(canChooseCharacter(theirs, null, 'user-1')).toBe(true)
    expect(canChooseCharacter(mine, 'player', 'user-1')).toBe(true)
    expect(canChooseCharacter(theirs, 'player', 'user-1')).toBe(false)
    expect(canChooseCharacter(undefined, 'gm', 'user-1')).toBe(false)
  })
})

describe('clampHitPointUpdates', () => {
  const target = character('a', { hpCurrent: 6, hpMax: 10 })

  it.each([
    [{ hpMax: -3 }, { hpMax: 0 }],
    [{ hpCurrent: 9, hpMax: 4 }, { hpCurrent: 4, hpMax: 4 }],
    [{ hpCurrent: 15 }, { hpCurrent: 10 }],
    [{ hpCurrent: -1 }, { hpCurrent: 0 }],
    [{ name: 'Only a name' }, { name: 'Only a name' }],
  ])('clamps %o to %o', (updates, expected) => {
    expect(clampHitPointUpdates(target, updates)).toEqual(expected)
  })

  it('does not change the updates it was given', () => {
    const updates = { hpCurrent: 20 }

    expect(clampHitPointUpdates(target, updates)).not.toBe(updates)
    expect(updates).toEqual({ hpCurrent: 20 })
  })
})

describe('updateCharacter', () => {
  it('applies the edit locally but schedules no save without a campaign', () => {
    vi.useFakeTimers()
    const saves = emptyCharacterSaves()
    const setCharacters = vi.fn()
    const context: CharacterActionContext = {
      campaign: null,
      role: 'player',
      userId: 'user-1',
      selectedCharacterId: 'a',
      charactersRef: { current: [character('a')] },
      savesRef: { current: saves },
      setCharacters,
      setSelectedCharacterId: vi.fn(),
      setCurrentCharacterId: vi.fn(),
    }

    updateCharacter(context, 'a', { name: 'Edited' })

    expect(context.charactersRef.current[0].name).toBe('Edited')
    expect(setCharacters).toHaveBeenCalledWith(context.charactersRef.current)
    expect(saves).toEqual({ pending: {}, inFlight: {} })
    vi.useRealTimers()
  })
})
