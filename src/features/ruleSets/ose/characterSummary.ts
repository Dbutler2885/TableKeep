import { storedCreationStatus, type CharacterSummary } from '../characterIdentity'
import type { StoredCharacter } from '../storedCharacter'

// An OSE character is in play while it has hit points left, whether or not a
// maximum is stored, and is a draft only when it was explicitly started as new.
export function oseCharacterSummary(stored: StoredCharacter): CharacterSummary {
  const startedAsNew = stored.creationModeExplicit === true && stored.creationMode === 'new'
  return {
    creationStatus: storedCreationStatus(stored) ?? (startedAsNew ? 'draft' : 'active'),
    inPlay: typeof stored.hpCurrent === 'number' && stored.hpCurrent > 0,
  }
}
