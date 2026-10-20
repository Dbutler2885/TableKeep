import type { Role } from '../../../types/app'
import { readCharacterStoreDoc, type CharacterStoreRecord, type CharacterStoreRuleSet } from './characterStoreRecord'
import { isCharacterStoreSaveOutstanding, type CharacterStoreSaves } from './characterStoreWrites'

type StoredCharacterDoc = { id: string; data: () => unknown }

export const findCharacterStoreCharacter = <Character extends CharacterStoreRecord>(characters: Character[], characterId: string) =>
  characters.find((character) => character.id === characterId)

/** A stored character, or the local copy while a save of it has not landed. */
function readSnapshotCharacter<Character extends CharacterStoreRecord>(
  ruleSet: CharacterStoreRuleSet<Character>,
  docSnap: StoredCharacterDoc,
  saves: CharacterStoreSaves,
  localCharacters: Character[],
): Character | null {
  const local = findCharacterStoreCharacter(localCharacters, docSnap.id)
  if (local && isCharacterStoreSaveOutstanding(saves, docSnap.id)) return local
  return readCharacterStoreDoc(ruleSet, docSnap.id, docSnap.data() as Record<string, unknown>, local)
}

/** The rule set's characters in a characters snapshot; documents of other systems are left out. */
export function readCharacterStoreSnapshot<Character extends CharacterStoreRecord>(
  ruleSet: CharacterStoreRuleSet<Character>,
  docs: StoredCharacterDoc[],
  saves: CharacterStoreSaves,
  localCharacters: Character[],
): Character[] {
  return docs
    .map((docSnap) => readSnapshotCharacter(ruleSet, docSnap, saves, localCharacters))
    .filter((character): character is Character => character !== null)
}

/** Every character for the GM; a player does not see the GM's own characters. */
export const visibleCharacterStoreCharacters = <Character extends CharacterStoreRecord>(
  characters: Character[],
  role: Role | null,
  gmUserId: string | null,
) => (role === 'gm' ? characters : characters.filter((character) => character.ownerUserId !== gmUserId))

const defaultSelection = (characters: CharacterStoreRecord[], userId: string) =>
  (characters.find((character) => character.ownerUserId === userId) ?? characters[0])?.id ?? ''

/**
 * Keeps a selection that is still listed; otherwise picks the current
 * character, then the user's own, then the first listed.
 */
export function nextSelectedCharacterStoreId(
  selectedCharacterId: string,
  characters: CharacterStoreRecord[],
  currentCharacterId: string | null,
  userId: string,
): string {
  if (characters.some((character) => character.id === selectedCharacterId)) return selectedCharacterId
  const currentCharacter = currentCharacterId ? findCharacterStoreCharacter(characters, currentCharacterId) : null
  if (currentCharacter) return currentCharacter.id
  return defaultSelection(characters, userId)
}
