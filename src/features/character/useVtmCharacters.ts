import type { Role } from '../../types/app'
import { useCharacterStore } from './characterStore/useCharacterStore'
import { vtmCharacterStore } from './vtmCharacterRecord'
import { makeVtmCharacter } from './vtmDefaults'

/** The campaign's VtM characters, loaded and saved through the shared character store. */
export function useVtmCharacters(
  campaignId: string | null,
  groupId: string | null,
  userId: string,
  currentUsername: string,
  role: Role | null,
  gmUserId: string | null,
  setError: (message: string) => void,
  enabled = true,
) {
  const store = useCharacterStore({ ruleSet: vtmCharacterStore, campaignId, groupId, userId, role, gmUserId, setError, enabled })
  return {
    ...store,
    // Players may own multiple characters; creation is no longer capped per user.
    addCharacter: (creationMode: 'new' | 'established') =>
      store.addCharacter(makeVtmCharacter(userId, currentUsername, creationMode)),
  }
}
