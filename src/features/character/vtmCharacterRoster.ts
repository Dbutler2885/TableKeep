import type { Role } from '../../types/app'
import { readVtmCharacterDoc } from './vtmCharacterRecord'
import { isVtmCharacterSaveOutstanding, type VtmCharacterSaves } from './vtmCharacterWrites'
import type { VtmCharacterRecord } from './vtmTypes'

type StoredCharacterDoc = { id: string; data: () => unknown }

export const findVtmCharacter = (characters: VtmCharacterRecord[], characterId: string) =>
  characters.find((character) => character.id === characterId)

/** A stored character, or the local copy while a save of it has not landed. */
function readSnapshotCharacter(
  docSnap: StoredCharacterDoc,
  saves: VtmCharacterSaves,
  localCharacters: VtmCharacterRecord[],
): VtmCharacterRecord | null {
  const local = findVtmCharacter(localCharacters, docSnap.id)
  if (local && isVtmCharacterSaveOutstanding(saves, docSnap.id)) return local
  return readVtmCharacterDoc(docSnap.id, docSnap.data() as Record<string, unknown>, local)
}

/** The VtM characters in a characters snapshot; documents of other systems are left out. */
export function readVtmCharacterSnapshot(
  docs: StoredCharacterDoc[],
  saves: VtmCharacterSaves,
  localCharacters: VtmCharacterRecord[],
): VtmCharacterRecord[] {
  return docs
    .map((docSnap) => readSnapshotCharacter(docSnap, saves, localCharacters))
    .filter((character): character is VtmCharacterRecord => character !== null)
}

/** Every character for the GM; a player does not see the GM's own characters. */
export const visibleVtmCharacters = (characters: VtmCharacterRecord[], role: Role | null, gmUserId: string | null) =>
  role === 'gm' ? characters : characters.filter((character) => character.ownerUserId !== gmUserId)

const defaultSelection = (characters: VtmCharacterRecord[], userId: string) =>
  (characters.find((character) => character.ownerUserId === userId) ?? characters[0])?.id ?? ''

/**
 * Keeps a selection that is still listed; otherwise picks the current
 * character, then the user's own, then the first listed.
 */
export function nextSelectedVtmCharacterId(
  selectedCharacterId: string,
  characters: VtmCharacterRecord[],
  currentCharacterId: string | null,
  userId: string,
): string {
  if (characters.some((character) => character.id === selectedCharacterId)) return selectedCharacterId
  const currentCharacter = currentCharacterId ? findVtmCharacter(characters, currentCharacterId) : null
  if (currentCharacter) return currentCharacter.id
  return defaultSelection(characters, userId)
}
