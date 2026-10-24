import type { CharacterRecord } from '../../../types/app'
import type { CharacterTabProps } from './characterTabTypes'

type VisibilityParams = Pick<CharacterTabProps, 'characters' | 'role' | 'currentCharacterId' | 'currentUserId'> & { embeddedMode: boolean }

/** The listed characters: an embedded player sees only their own current character. */
export function visibleCharactersFor({ characters, embeddedMode, role, currentCharacterId, currentUserId }: VisibilityParams) {
  return embeddedMode && role === 'player'
    ? characters.filter((character) => character.id === currentCharacterId && character.ownerUserId === currentUserId)
    : characters
}

/** Tier order: active player characters, then active GM-owned, then dead. */
export function characterTier(character: CharacterRecord, gmUserId: string | null) {
  if (character.hpCurrent <= 0) return 2
  if (gmUserId && character.ownerUserId === gmUserId) return 1
  return 0
}

/** A sorted copy of the roster, by tier and then by name. */
export function sortCharactersByTier(characters: CharacterRecord[], gmUserId: string | null) {
  return [...characters].sort((a, b) => {
    const tierDiff = characterTier(a, gmUserId) - characterTier(b, gmUserId)
    if (tierDiff !== 0) return tierDiff
    return a.name.localeCompare(b.name)
  })
}

type SelectionParams = Pick<CharacterTabProps, 'selectedCharacter' | 'selectedCharacterId'> & {
  embeddedMode: boolean
  sortedCharacters: CharacterRecord[]
}

/** The sheet's character: the first listed one when embedded, else the explicit record, else the roster record for the id. */
export function resolveEffectiveSelected({ embeddedMode, sortedCharacters, selectedCharacter, selectedCharacterId }: SelectionParams) {
  if (embeddedMode) return sortedCharacters[0] ?? null
  return selectedCharacter ?? sortedCharacters.find((character) => character.id === selectedCharacterId) ?? null
}

export function characterIdOf(character: CharacterRecord | null) {
  return character?.id ?? null
}
