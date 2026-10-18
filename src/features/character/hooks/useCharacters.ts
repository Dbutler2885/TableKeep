// Owns the campaign character subscription and write-reconciliation effects.
// This hook sits above CharacterTab, so its effects are outside the local justSeeded ordering chain.
// Its effects run in this order: list ref sync, current character, character list,
// media URLs, current character fallback, then sending waiting saves on leaving.
import { useEffect, useEffectEvent, useMemo, useRef, useState, type RefObject } from 'react'
import type { CharacterRecord, Role } from '../../../types/app'
import {
  chooseCurrentCharacter,
  deleteCharacter,
  syncCharacterLocal,
  updateCharacter,
  type CharacterActionContext,
} from '../lib/characterActions'
import { fallbackCurrentCharacterId, findCharacter } from '../lib/characterSnapshot'
import {
  campaignScope,
  emptyCharacterSaves,
  isCharacterSaveOutstanding,
  sendCharacterSavesNow,
  type CharacterSaves,
} from '../lib/characterWrites'
import { useCharacterMediaUrls } from './useCharacterMediaUrls'
import { useCharacterListSubscription, useCurrentCharacterId } from './useCharacterSubscriptions'

/** The character list, and a ref to it that the save timers and snapshot reader read. */
function useCharacterList() {
  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const charactersRef = useRef<CharacterRecord[]>([])

  useEffect(() => {
    charactersRef.current = characters
  }, [characters])

  return [characters, setCharacters, charactersRef] as const
}

type CurrentCharacterFallbackOptions = {
  campaignId: string | null
  role: Role | null
  userId: string
  characters: CharacterRecord[]
  currentCharacterId: string | null
  chooseCurrentCharacter: (characterId: string) => Promise<void>
}

/** Makes a player's first own character current whenever their current character is not one of their own. */
function useCurrentCharacterFallback(options: CurrentCharacterFallbackOptions) {
  const { campaignId, role, userId, characters, currentCharacterId } = options
  const choose = useEffectEvent(options.chooseCurrentCharacter)

  useEffect(() => {
    if (!campaignId || role !== 'player') return
    const fallbackCharacterId = fallbackCurrentCharacterId(characters, currentCharacterId, userId)
    if (fallbackCharacterId) void choose(fallbackCharacterId)
  }, [campaignId, characters, currentCharacterId, role, userId])
}

/**
 * Sends every waiting save when the list is switched off, the campaign changes
 * or the hook unmounts, so the last edit is not lost. This cleanup runs before
 * the list is cleared, and the save reads the character from the campaign it
 * was made in, never a character of the same id in the next campaign. The next
 * campaign then starts with no saves of its own, so a save still landing in the
 * old campaign never makes its snapshot keep the old campaign's character.
 */
function useSendCharacterSavesOnLeave(
  savesRef: RefObject<CharacterSaves>,
  campaignId: string | null,
  groupId: string | null,
  enabled: boolean,
) {
  useEffect(() => {
    const saves = savesRef.current
    return () => {
      sendCharacterSavesNow(saves)
      savesRef.current = emptyCharacterSaves()
    }
  }, [savesRef, campaignId, groupId, enabled])
}

export function useCharacters(
  campaignId: string | null,
  groupId: string | null,
  userId: string,
  currentUsername: string,
  role: Role | null,
  gmUserId: string | null,
  setError: (message: string) => void,
  enabled = true,
) {
  const savesRef = useRef<CharacterSaves>(emptyCharacterSaves())
  const [characters, setCharacters, charactersRef] = useCharacterList()
  const [currentCharacterId, setCurrentCharacterId] = useCurrentCharacterId(campaignId, groupId, userId, enabled, setError)
  const { charactersLoading, selectedCharacterId, setSelectedCharacterId } = useCharacterListSubscription({
    campaignId, groupId, userId, currentUsername, role, gmUserId, currentCharacterId, enabled, setError,
    savesRef, charactersRef, setCharacters,
  })
  useCharacterMediaUrls(characters, setCharacters)

  const context: CharacterActionContext = {
    campaign: campaignScope(campaignId, groupId),
    role,
    userId,
    selectedCharacterId,
    charactersRef,
    savesRef,
    setCharacters,
    setSelectedCharacterId,
    setCurrentCharacterId,
  }
  const setCurrentCharacter = (characterId: string) => chooseCurrentCharacter(context, characterId)

  useCurrentCharacterFallback({
    campaignId, role, userId, characters, currentCharacterId, chooseCurrentCharacter: setCurrentCharacter,
  })
  useSendCharacterSavesOnLeave(savesRef, campaignId, groupId, enabled)

  const selectedCharacter = useMemo(
    () => findCharacter(characters, selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  )

  return {
    characters,
    charactersLoading,
    currentCharacterId,
    setCurrentCharacter,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    updateCharacter: (characterId: string, updates: Partial<CharacterRecord>) =>
      updateCharacter(context, characterId, updates),
    syncCharacterLocal: (characterId: string, updates: Partial<CharacterRecord>) =>
      syncCharacterLocal(context, characterId, updates),
    deleteCharacter: (characterId: string) => deleteCharacter(context, characterId),
    hasPendingWrite: (id: string) => isCharacterSaveOutstanding(savesRef.current, id),
  }
}
