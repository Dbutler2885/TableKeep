import { describe, expect, it, vi } from 'vitest'
import { characterFixture } from '../characterTestFixtures'
import { selectedCharacterUpdaters } from './selectedCharacterUpdates'

describe('selected character updaters', () => {
  it('drops hpMax from a copy for a regular update and passes a system update through', () => {
    const updateCharacter = vi.fn()
    const { updateSelectedCharacter, updateSelectedCharacterSystem } = selectedCharacterUpdaters(characterFixture(), updateCharacter)
    const updates = { name: 'Renamed', hpMax: 12 }
    updateSelectedCharacter(updates)
    expect(updateCharacter).toHaveBeenLastCalledWith('hero', { name: 'Renamed' })
    expect(updates).toEqual({ name: 'Renamed', hpMax: 12 })
    updateSelectedCharacterSystem(updates)
    expect(updateCharacter).toHaveBeenLastCalledWith('hero', updates)
  })

  it('ignores both updates without a selection', () => {
    const updateCharacter = vi.fn()
    const { updateSelectedCharacter, updateSelectedCharacterSystem } = selectedCharacterUpdaters(null, updateCharacter)
    updateSelectedCharacter({ name: 'Nobody' })
    updateSelectedCharacterSystem({ hpMax: 4 })
    expect(updateCharacter).not.toHaveBeenCalled()
  })
})
