import { useEffect, useMemo, useRef, type RefObject } from 'react'
import type { Role } from '../../types/app'
import {
  addVtmCharacter,
  chooseCurrentVtmCharacter,
  deleteVtmCharacter,
  updateVtmCharacter,
  type VtmCharacterActionContext,
} from './vtmCharacterActions'
import { findVtmCharacter } from './vtmCharacterRoster'
import {
  emptyVtmCharacterSaves,
  sendVtmCharacterSavesNow,
  vtmCampaignScope,
  type VtmCharacterSaves,
} from './vtmCharacterWrites'
import { useVtmCharacterMedia } from './useVtmCharacterMedia'
import { useCurrentVtmCharacterId, useVtmCharacterRoster } from './useVtmCharacterRoster'
import type { VtmCharacterRecord } from './vtmTypes'

/**
 * Sends every waiting save when the sheet closes or the campaign changes, so
 * the last edit is not lost. The next campaign then starts with no saves of its
 * own, so a save still landing in the old campaign never makes the new
 * campaign's snapshot keep the old campaign's character in place of a
 * character with the same id.
 */
function useSendVtmCharacterSavesOnLeave(
  savesRef: RefObject<VtmCharacterSaves>,
  campaignId: string | null,
  groupId: string | null,
) {
  useEffect(() => {
    const saves = savesRef.current
    return () => {
      sendVtmCharacterSavesNow(saves)
      savesRef.current = emptyVtmCharacterSaves()
    }
  }, [savesRef, campaignId, groupId])
}

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
  const savesRef = useRef<VtmCharacterSaves>(emptyVtmCharacterSaves())
  const [currentCharacterId, setCurrentCharacterId] = useCurrentVtmCharacterId(campaignId, groupId, userId, enabled, setError)
  const roster = useVtmCharacterRoster({
    campaignId, groupId, userId, role, gmUserId, currentCharacterId, enabled, setError, savesRef,
  })
  const { characters, setCharacters, selectedCharacterId, setSelectedCharacterId } = roster
  useVtmCharacterMedia(characters, setCharacters)
  useSendVtmCharacterSavesOnLeave(savesRef, campaignId, groupId)

  const context: VtmCharacterActionContext = {
    campaign: vtmCampaignScope(campaignId, groupId),
    role,
    userId,
    currentUsername,
    charactersRef: roster.charactersRef,
    savesRef,
    setCharacters,
    setSelectedCharacterId,
    setCurrentCharacterId,
  }

  const selectedCharacter = useMemo(
    () => findVtmCharacter(characters, selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  )

  return {
    characters,
    charactersLoading: roster.charactersLoading,
    currentCharacterId,
    setCurrentCharacter: (characterId: string) => chooseCurrentVtmCharacter(context, characterId),
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    addCharacter: (creationMode: 'new' | 'established') => addVtmCharacter(context, creationMode),
    updateCharacter: (characterId: string, updates: Partial<VtmCharacterRecord>) =>
      updateVtmCharacter(context, characterId, updates),
    deleteCharacter: (characterId: string) => deleteVtmCharacter(context, characterId),
  }
}
