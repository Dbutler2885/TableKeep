import { describe, expect, it } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import {
  fallbackCurrentCharacterId,
  nextSelectedCharacterId,
  readCharacterSnapshot,
  selectionAfterDelete,
  visibleCharacters,
} from './characterSnapshot'
import { emptyCharacterSaves } from './characterWrites'
import { readStoredCharacter } from './storedCharacterRecord'

const viewer = { userId: 'user-1', currentUsername: 'Player One' }
const character = (id: string, ownerUserId = 'user-1'): CharacterRecord =>
  readStoredCharacter(id, { ownerUserId }, undefined, viewer)
const doc = (id: string, fields: Record<string, unknown>) => ({ id, data: () => fields })
const ids = (characters: CharacterRecord[]) => characters.map((entry) => entry.id)

describe('readCharacterSnapshot', () => {
  it('reads every stored document in order', () => {
    const read = readCharacterSnapshot([doc('b', { name: 'B' }), doc('a', { name: 'A' })], emptyCharacterSaves(), [], viewer)

    expect(read.map((entry) => entry.name)).toEqual(['B', 'A'])
  })

  it('keeps the local copy while its save is waiting or in flight', () => {
    const localA = { ...character('a'), name: 'Local A' }
    const localB = { ...character('b'), name: 'Local B' }
    const localC = { ...character('c'), name: 'Local C' }
    const saves = emptyCharacterSaves()
    saves.pending.a = setTimeout(() => undefined, 0)
    saves.inFlight.b = true
    clearTimeout(saves.pending.a)

    const read = readCharacterSnapshot(
      [doc('a', { name: 'Stored A' }), doc('b', { name: 'Stored B' }), doc('c', { name: 'Stored C' })],
      saves,
      [localA, localB, localC],
      viewer,
    )

    expect(read[0]).toBe(localA)
    expect(read[1]).toBe(localB)
    expect(read[2].name).toBe('Stored C')
  })

  it('reads the stored document of a waiting save that has no local copy', () => {
    const saves = emptyCharacterSaves()
    saves.inFlight.a = true

    expect(readCharacterSnapshot([doc('a', { name: 'Stored' })], saves, [], viewer)[0].name).toBe('Stored')
  })
})

describe('visibleCharacters', () => {
  const party = [character('gm-own', 'gm-1'), character('mine')]

  it('shows the GM everything and hides the GM\'s own characters from a player', () => {
    expect(visibleCharacters(party, 'gm', 'gm-1')).toBe(party)
    expect(ids(visibleCharacters(party, 'player', 'gm-1'))).toEqual(['mine'])
    expect(ids(visibleCharacters(party, null, 'gm-1'))).toEqual(['mine'])
  })
})

describe('nextSelectedCharacterId', () => {
  const listed = [character('other', 'user-2'), character('mine'), character('third', 'user-3')]

  it('keeps a selection that is still listed', () => {
    expect(nextSelectedCharacterId('third', listed, 'other', 'user-1')).toBe('third')
  })

  it('picks the current character, then the user\'s own, then the first listed', () => {
    expect(nextSelectedCharacterId('gone', listed, 'other', 'user-1')).toBe('other')
    expect(nextSelectedCharacterId('gone', listed, 'missing', 'user-1')).toBe('mine')
    expect(nextSelectedCharacterId('gone', listed, null, 'user-9')).toBe('other')
  })

  it('selects nothing from an empty list', () => {
    expect(nextSelectedCharacterId('gone', [], 'other', 'user-1')).toBe('')
  })
})

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
