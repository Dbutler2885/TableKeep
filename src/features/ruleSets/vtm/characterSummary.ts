import { storedCreationStatus, type CharacterSummary } from '../characterIdentity'
import type { StoredCharacter } from '../storedCharacter'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const incapacitated = (stored: StoredCharacter) => {
  const vtm = isRecord(stored.vtm) ? stored.vtm : null
  const health = vtm && isRecord(vtm.health) ? vtm.health : null
  return health?.Incapacitated === true
}

// A VtM character is in play until it is incapacitated. One with no creation
// status is a draft when started as new, and otherwise an established draft.
export function vtmCharacterSummary(stored: StoredCharacter): CharacterSummary {
  return {
    creationStatus: storedCreationStatus(stored) ?? (stored.creationMode === 'new' ? 'draft' : 'established_draft'),
    inPlay: !incapacitated(stored),
  }
}
