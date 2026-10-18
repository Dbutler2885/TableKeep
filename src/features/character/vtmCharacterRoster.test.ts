import { describe, expect, it } from 'vitest'
import {
  nextSelectedVtmCharacterId,
  readVtmCharacterSnapshot,
  visibleVtmCharacters,
} from './vtmCharacterRoster'
import { emptyVtmCharacterSaves } from './vtmCharacterWrites'
import { makeVtmCharacter } from './vtmDefaults'

const character = (id: string, ownerUserId: string, name = id) =>
  ({ ...makeVtmCharacter(ownerUserId, ownerUserId), id, name })

const storedDoc = (id: string, fields: Record<string, unknown>) => ({ id, data: () => fields })

describe('readVtmCharacterSnapshot', () => {
  it('reads the VtM documents and leaves the rest out', () => {
    const docs = [storedDoc('a', { system: 'vtm', name: 'A' }), storedDoc('b', { system: 'ose' })]

    const read = readVtmCharacterSnapshot(docs, emptyVtmCharacterSaves(), [])

    expect(read.map((entry) => entry.name)).toEqual(['A'])
  })

  it.each([
    ['waiting', { pending: { a: setTimeout(() => undefined, 0) }, inFlight: {} }],
    ['in flight', { pending: {}, inFlight: { a: true } }],
  ])('keeps the local copy while its save is %s', (_label, saves) => {
    const localA = character('a', 'user-1', 'Local')

    const read = readVtmCharacterSnapshot([storedDoc('a', { system: 'vtm', name: 'Stored' })], saves, [localA])

    expect(read).toEqual([localA])
    clearTimeout(saves.pending.a)
  })

  it('reads the stored copy when nothing is saving', () => {
    const read = readVtmCharacterSnapshot(
      [storedDoc('a', { system: 'vtm', name: 'Stored' })],
      emptyVtmCharacterSaves(),
      [character('a', 'user-1', 'Local')],
    )

    expect(read[0].name).toBe('Stored')
  })
})

describe('visibleVtmCharacters', () => {
  const party = [character('npc', 'gm-1'), character('pc', 'user-1')]

  it('shows the GM everything and hides the GM\'s characters from players', () => {
    expect(visibleVtmCharacters(party, 'gm', 'gm-1')).toBe(party)
    expect(visibleVtmCharacters(party, 'player', 'gm-1').map((entry) => entry.id)).toEqual(['pc'])
  })
})

describe('nextSelectedVtmCharacterId', () => {
  const party = [character('first', 'user-2'), character('current', 'user-3'), character('mine', 'user-1')]

  it('keeps a selection that is still listed', () => {
    expect(nextSelectedVtmCharacterId('first', party, 'current', 'user-1')).toBe('first')
  })

  it('falls back to the current character, then the user\'s own, then the first', () => {
    expect(nextSelectedVtmCharacterId('gone', party, 'current', 'user-1')).toBe('current')
    expect(nextSelectedVtmCharacterId('gone', party, 'missing', 'user-1')).toBe('mine')
    expect(nextSelectedVtmCharacterId('gone', party, null, 'user-9')).toBe('first')
    expect(nextSelectedVtmCharacterId('gone', [], null, 'user-1')).toBe('')
  })
})
