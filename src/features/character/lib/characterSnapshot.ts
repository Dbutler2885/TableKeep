import type { CharacterRecord } from '../../../types/app'

/**
 * The selection after a character is deleted: nothing once the list is empty,
 * the first one left when the selected one went, or null to keep it.
 */
export function selectionAfterDelete(
  remaining: Pick<CharacterRecord, 'id'>[],
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
