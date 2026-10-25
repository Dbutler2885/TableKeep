import { useEffect, useMemo, useRef, type RefObject } from 'react'
import type { Role } from '../../../types/app'
import {
  addCharacterStoreCharacter,
  chooseCharacterStoreCurrentCharacter,
  deleteCharacterStoreCharacter,
  syncCharacterStoreCharacterLocal,
  updateCharacterStoreCharacter,
  updateCharacterStoreCharacterNow,
  type CharacterStoreActionContext,
} from './characterStoreActions'
import type { CharacterStoreRecord, CharacterStoreRuleSet } from './characterStoreRecord'
import { findCharacterStoreCharacter } from './characterStoreRoster'
import {
  characterStoreScope,
  emptyCharacterStoreSaves,
  isCharacterStoreSaveOutstanding,
  sendCharacterStoreSavesNow,
  type CharacterStoreCollection,
  type CharacterStoreSaves,
} from './characterStoreWrites'
import { useCharacterStoreMedia } from './useCharacterStoreMedia'
import { useCharacterStoreCurrentCharacterId, useCharacterStoreRoster } from './useCharacterStoreRoster'

/**
 * Sends every waiting save when the sheet closes or the campaign changes, so
 * the last edit is not lost. The next campaign then starts with no saves of its
 * own, so a save still landing in the old campaign never makes the new
 * campaign's snapshot keep the old campaign's character in place of a
 * character with the same id.
 */
function useSendCharacterStoreSavesOnLeave(
  savesRef: RefObject<CharacterStoreSaves>,
  campaignId: string | null,
  groupId: string | null,
) {
  useEffect(() => {
    const saves = savesRef.current
    return () => {
      sendCharacterStoreSavesNow(saves)
      savesRef.current = emptyCharacterStoreSaves()
    }
  }, [savesRef, campaignId, groupId])
}

export type CharacterStoreOptions<Character extends CharacterStoreRecord> = {
  ruleSet: CharacterStoreRuleSet<Character>
  campaignId: string | null
  groupId: string | null
  userId: string
  role: Role | null
  gmUserId: string | null
  setError: (message: string) => void
  enabled: boolean
  /** The campaign collection the records live in; the characters unless named. */
  collection?: CharacterStoreCollection
  /** Narrows the store to the one record with this id. */
  onlyId?: string
}

/**
 * One rule set's characters in a campaign: loaded through its steps and
 * parser, saved half a second after the last edit with its version stamp, with
 * their stored media resolved, and the user's current character.
 */
export function useCharacterStore<Character extends CharacterStoreRecord>(options: CharacterStoreOptions<Character>) {
  const { ruleSet, campaignId, groupId, userId, role, gmUserId, setError, enabled, collection = 'characters', onlyId } = options
  const savesRef = useRef<CharacterStoreSaves>(emptyCharacterStoreSaves())
  const [currentCharacterId, setCurrentCharacterId] = useCharacterStoreCurrentCharacterId(campaignId, groupId, userId, enabled, setError)
  const roster = useCharacterStoreRoster({
    ruleSet, collection, onlyId, campaignId, groupId, userId, role, gmUserId, currentCharacterId, enabled, setError, savesRef,
  })
  const { characters, setCharacters, selectedCharacterId, setSelectedCharacterId } = roster
  useCharacterStoreMedia(characters, setCharacters)
  useSendCharacterStoreSavesOnLeave(savesRef, campaignId, groupId)

  const context: CharacterStoreActionContext<Character> = {
    ruleSet,
    campaign: characterStoreScope(campaignId, groupId, collection),
    role,
    userId,
    charactersRef: roster.charactersRef,
    savesRef,
    setCharacters,
    setSelectedCharacterId,
    setCurrentCharacterId,
  }

  const selectedCharacter = useMemo(
    () => findCharacterStoreCharacter(characters, selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  )

  return {
    characters,
    charactersLoading: roster.charactersLoading,
    currentCharacterId,
    setCurrentCharacter: (characterId: string) => chooseCharacterStoreCurrentCharacter(context, characterId),
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    addCharacter: (character: Character) => addCharacterStoreCharacter(context, character),
    updateCharacter: (characterId: string, updates: Partial<Character>) =>
      updateCharacterStoreCharacter(context, characterId, updates),
    /** Like `updateCharacter`, but saves at once rather than after the delay. */
    updateCharacterNow: (characterId: string, updates: Partial<Character>) =>
      updateCharacterStoreCharacterNow(context, characterId, updates),
    syncCharacterLocal: (characterId: string, updates: Partial<Character>) =>
      syncCharacterStoreCharacterLocal(context, characterId, updates),
    deleteCharacter: (characterId: string) => deleteCharacterStoreCharacter(context, characterId),
    hasPendingWrite: (characterId: string) => isCharacterStoreSaveOutstanding(savesRef.current, characterId),
  }
}
