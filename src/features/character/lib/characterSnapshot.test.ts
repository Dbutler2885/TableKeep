import { describe, expect, it } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import { fallbackCurrentCharacterId, selectionAfterDelete } from './characterSnapshot'
import { readStoredCharacter } from './storedCharacterRecord'

const viewer = { userId: 'user-1', currentUsername: 'Player One' }
const character = (id: string, ownerUserId = 'user-1'): CharacterRecord =>
  readStoredCharacter(id, { ownerUserId }, viewer)

describe('selectionAfterDelete', () => {
  it('selects nothing once the list is empty', () => {
    expect(selectionAfterDelete([], 'a', 'b')).toBe('')
  })

  it('selects the first one left when the selected one went, and otherwise keeps the selection', () => {
    const remaining = [character('b'), character('c')]

    expect(selectionAfterDelete(remaining, 'a', 'a')).toBe('b')
    expect(selectionAfterDelete(remaining, 'c', 'a')).toBeNull()
  })
})

describe('fallbackCurrentCharacterId', () => {
  const listed = [character('other', 'user-2'), character('first'), character('second')]

  it('picks the first own character when the current one is missing or not owned', () => {
    expect(fallbackCurrentCharacterId(listed, null, 'user-1')).toBe('first')
    expect(fallbackCurrentCharacterId(listed, 'other', 'user-1')).toBe('first')
  })

  it('keeps an own current character, and has nothing for a user who owns none', () => {
    expect(fallbackCurrentCharacterId(listed, 'second', 'user-1')).toBeNull()
    expect(fallbackCurrentCharacterId(listed, null, 'user-9')).toBeNull()
  })
})
