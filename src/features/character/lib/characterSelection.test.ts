import { describe, expect, it } from 'vitest'
import { characterFixture } from '../characterTestFixtures'
import {
  characterIdOf,
  characterTier,
  resolveEffectiveSelected,
  sortCharactersByTier,
  visibleCharactersFor,
} from './characterSelection'

const own = characterFixture({ id: 'own' })
const otherOwner = characterFixture({ id: 'own-elsewhere', ownerUserId: 'someone' })
const notCurrent = characterFixture({ id: 'not-current' })
const roster = [own, otherOwner, notCurrent]

describe('visible characters', () => {
  const base = { characters: roster, currentCharacterId: 'own', currentUserId: 'player' }

  it('shows an embedded player only their own current character', () => {
    expect(visibleCharactersFor({ ...base, embeddedMode: true, role: 'player' })).toEqual([own])
    expect(visibleCharactersFor({ ...base, embeddedMode: true, role: 'player', currentCharacterId: 'own-elsewhere' })).toEqual([])
  })

  it('shows the whole roster outside embedded mode and to an embedded GM', () => {
    expect(visibleCharactersFor({ ...base, embeddedMode: false, role: 'player' })).toBe(roster)
    expect(visibleCharactersFor({ ...base, embeddedMode: true, role: 'gm' })).toBe(roster)
    expect(visibleCharactersFor({ ...base, embeddedMode: true, role: null })).toBe(roster)
  })
})

describe('roster order', () => {
  it('ranks living player characters, then living GM characters, then the dead', () => {
    expect(characterTier(characterFixture({ hpCurrent: 1 }), 'gm')).toBe(0)
    expect(characterTier(characterFixture({ ownerUserId: 'gm' }), 'gm')).toBe(1)
    expect(characterTier(characterFixture({ ownerUserId: 'gm', hpCurrent: 0 }), 'gm')).toBe(2)
    expect(characterTier(characterFixture({ hpCurrent: -3 }), 'gm')).toBe(2)
  })

  it('treats every living character as a player character without a GM', () => {
    expect(characterTier(characterFixture({ ownerUserId: 'gm' }), null)).toBe(0)
    expect(characterTier(characterFixture({ ownerUserId: '' }), '')).toBe(0)
  })

  it('sorts a copy by tier and then by name', () => {
    const characters = [
      characterFixture({ id: 'dead', name: 'A dead', hpCurrent: 0 }),
      characterFixture({ id: 'gm', name: 'A GM', ownerUserId: 'gm' }),
      characterFixture({ id: 'zed', name: 'Zed' }),
      characterFixture({ id: 'abe', name: 'Abe' }),
    ]
    const sorted = sortCharactersByTier(characters, 'gm')
    expect(sorted.map(({ id }) => id)).toEqual(['abe', 'zed', 'gm', 'dead'])
    expect(characters.map(({ id }) => id)).toEqual(['dead', 'gm', 'zed', 'abe'])
  })
})

describe('effective selection', () => {
  const explicit = characterFixture({ id: 'explicit' })

  it('uses the first listed character when embedded, whatever is selected', () => {
    expect(resolveEffectiveSelected({ embeddedMode: true, sortedCharacters: [own, notCurrent], selectedCharacter: explicit, selectedCharacterId: 'not-current' })).toBe(own)
    expect(resolveEffectiveSelected({ embeddedMode: true, sortedCharacters: [], selectedCharacter: explicit, selectedCharacterId: 'own' })).toBeNull()
  })

  it('prefers the explicit record, then the roster record for the id, then nothing', () => {
    const base = { embeddedMode: false, sortedCharacters: [own, notCurrent] }
    expect(resolveEffectiveSelected({ ...base, selectedCharacter: explicit, selectedCharacterId: 'own' })).toBe(explicit)
    expect(resolveEffectiveSelected({ ...base, selectedCharacter: null, selectedCharacterId: 'not-current' })).toBe(notCurrent)
    expect(resolveEffectiveSelected({ ...base, selectedCharacter: null, selectedCharacterId: 'missing' })).toBeNull()
  })

  it('reads the id of a selection, or null without one', () => {
    expect(characterIdOf(own)).toBe('own')
    expect(characterIdOf(null)).toBeNull()
  })
})
