import type { CharacterRecord } from '../../../types/app'

type UpdateCharacter = (characterId: string, updates: Partial<CharacterRecord>) => void

/**
 * Update callbacks bound to the sheet's character; both ignore a call without one.
 * The regular update drops `hpMax` from a copy of its input, and the system update passes everything through.
 */
export function selectedCharacterUpdaters(effectiveSelected: CharacterRecord | null, updateCharacter: UpdateCharacter) {
  const updateSelectedCharacter = (updates: Partial<CharacterRecord>) => {
    if (!effectiveSelected) return
    const nextUpdates = { ...updates }
    delete nextUpdates.hpMax
    updateCharacter(effectiveSelected.id, nextUpdates)
  }

  const updateSelectedCharacterSystem = (updates: Partial<CharacterRecord>) => {
    if (!effectiveSelected) return
    updateCharacter(effectiveSelected.id, updates)
  }

  return { updateSelectedCharacter, updateSelectedCharacterSystem }
}
