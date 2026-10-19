import { storedCreationStatus, type CharacterSummary } from '../characterIdentity'
import type { StoredCharacter } from '../storedCharacter'

// A Lubec character is always in play. Lubec has no creation flow yet, so one
// with no creation status is active.
export function lubecCharacterSummary(stored: StoredCharacter): CharacterSummary {
  return {
    creationStatus: storedCreationStatus(stored) ?? 'active',
    inPlay: true,
  }
}
