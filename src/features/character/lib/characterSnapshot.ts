import type { CharacterRecord, Role } from '../../../types/app'
import { isCharacterSaveOutstanding, type CharacterSaves } from './characterWrites'
import { readStoredCharacter, type CharacterViewer, type StoredCharacterFields } from './storedCharacterRecord'

type StoredCharacterDoc = { id: string; data: () => unknown }

export const findCharacter = (characters: CharacterRecord[], characterId: string) =>
  characters.find((character) => character.id === characterId)

/** A stored character, or the local copy while a save of it has not landed. */
function readSnapshotCharacter(
  docSnap: StoredCharacterDoc,
  saves: CharacterSaves,
  localCharacters: CharacterRecord[],
  viewer: CharacterViewer,
): CharacterRecord {
  const local = findCharacter(localCharacters, docSnap.id)
  if (local && isCharacterSaveOutstanding(saves, docSnap.id)) return local
  return readStoredCharacter(docSnap.id, docSnap.data() as StoredCharacterFields, local, viewer)
}

/** Every character in a characters snapshot. */
export function readCharacterSnapshot(
  docs: StoredCharacterDoc[],
  saves: CharacterSaves,
  localCharacters: CharacterRecord[],
  viewer: CharacterViewer,
): CharacterRecord[] {
  return docs.map((docSnap) => readSnapshotCharacter(docSnap, saves, localCharacters, viewer))
}

/** Every character for the GM; a player does not see the GM's own characters. */
export const visibleCharacters = (characters: CharacterRecord[], role: Role | null, gmUserId: string | null) =>
  role === 'gm' ? characters : characters.filter((character) => character.ownerUserId !== gmUserId)

const defaultSelection = (characters: CharacterRecord[], userId: string) =>
  (characters.find((character) => character.ownerUserId === userId) ?? characters[0])?.id ?? ''

/**
 * Keeps a selection that is still listed; otherwise picks the current
 * character, then the user's own, then the first listed, and nothing from an empty list.
 */
export function nextSelectedCharacterId(
  selectedCharacterId: string,
  characters: CharacterRecord[],
  currentCharacterId: string | null,
  userId: string,
): string {
  if (characters.some((character) => character.id === selectedCharacterId)) return selectedCharacterId
  const currentCharacter = currentCharacterId ? findCharacter(characters, currentCharacterId) : null
  if (currentCharacter) return currentCharacter.id
  return defaultSelection(characters, userId)
}

/**
 * The selection after a character is deleted: nothing once the list is empty,
 * the first one left when the selected one went, or null to keep it.
 */
export function selectionAfterDelete(
  remaining: CharacterRecord[],
  selectedCharacterId: string,
  deletedCharacterId: string,
): string | null {
  if (remaining.length === 0) return ''
  return selectedCharacterId === deletedCharacterId ? remaining[0].id : null
}

/**
 * The player's first own character when their current character is not one
 * of their own, or null when it is or they own none.
 */
export function fallbackCurrentCharacterId(
  characters: CharacterRecord[],
  currentCharacterId: string | null,
  userId: string,
): string | null {
  const owned = characters.filter((character) => character.ownerUserId === userId)
  if (owned.length === 0) return null
  const hasValidCurrent = !!currentCharacterId && owned.some((character) => character.id === currentCharacterId)
  return hasValidCurrent ? null : owned[0].id
}
