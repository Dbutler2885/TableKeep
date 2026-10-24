import { storedCreationStatus, type CharacterSummary } from '../characterIdentity'
import type { StoredCharacter } from '../storedCharacter'

// A Lubec character is always in play. One with no creation status is a draft
// when started as new, and otherwise an established draft, so only a finalized
// character counts towards the party.
export function lubecCharacterSummary(stored: StoredCharacter): CharacterSummary {
  return {
    creationStatus: storedCreationStatus(stored) ?? (stored.creationMode === 'new' ? 'draft' : 'established_draft'),
    inPlay: true,
  }
}
