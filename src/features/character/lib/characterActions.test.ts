import { describe, expect, it } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import { clampHitPointUpdates } from './characterActions'
import { readStoredCharacter } from './storedCharacterRecord'

const viewer = { userId: 'user-1', currentUsername: 'Player One' }
const character = (id: string, fields: Record<string, unknown> = {}): CharacterRecord =>
  readStoredCharacter(id, { ownerUserId: 'user-1', ...fields }, viewer)

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
