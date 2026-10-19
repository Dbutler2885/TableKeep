import type { ComponentProps } from 'react'
import type { CharacterTab } from '../character/CharacterTab'
import type { useCharacters } from '../character/hooks/useCharacters'
import type { Campaign, Role } from '../../types/app'

export type CharacterTabProps = ComponentProps<typeof CharacterTab>

type CharacterState = ReturnType<typeof useCharacters>

export type CharacterViewer = { userId: string; username: string; role: Role | null }

// The OSE character state the character and maps tabs share.
export function characterTabPropsFor(campaign: Campaign | null, viewer: CharacterViewer, state: CharacterState): CharacterTabProps | null {
  if (!campaign) return null
  return {
    campaignId: campaign.id,
    groupId: campaign.groupId,
    gmUserId: campaign.gmUserId ?? null,
    currentUserId: viewer.userId,
    currentUsername: viewer.username,
    role: viewer.role,
    characters: state.characters,
    charactersLoading: state.charactersLoading,
    currentCharacterId: state.currentCharacterId,
    setCurrentCharacter: state.setCurrentCharacter,
    selectedCharacterId: state.selectedCharacterId,
    setSelectedCharacterId: state.setSelectedCharacterId,
    selectedCharacter: state.selectedCharacter,
    updateCharacter: state.updateCharacter,
    syncCharacterLocal: state.syncCharacterLocal,
    deleteCharacter: state.deleteCharacter,
    hasPendingWrite: state.hasPendingWrite,
  }
}
