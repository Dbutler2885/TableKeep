// OSE's characters in a campaign, loaded and saved through the shared character store.
// This hook sits above CharacterTab, so its effects are outside the local justSeeded ordering chain.
// The store's effects run first, then the current character fallback.
import { useEffect, useEffectEvent, useMemo } from 'react'
import type { CharacterRecord, Role } from '../../../types/app'
import { useCharacterStore } from '../characterStore/useCharacterStore'
import { fallbackCurrentCharacterId, selectionAfterDelete } from '../lib/characterSnapshot'
import { oseCharacterStore } from '../lib/storedCharacterRecord'

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
  const ruleSet = useMemo(() => oseCharacterStore({ userId, currentUsername }), [currentUsername, userId])
  const store = useCharacterStore({ ruleSet, campaignId, groupId, userId, role, gmUserId, setError, enabled })
  const { characters, currentCharacterId, selectedCharacterId, setSelectedCharacterId } = store

  useCurrentCharacterFallback({
    campaignId, role, userId, characters, currentCharacterId, chooseCurrentCharacter: store.setCurrentCharacter,
  })

  return {
    ...store,
    // Deleting the selected character selects the first one left, and the last one selects nothing.
    deleteCharacter: (characterId: string) => {
      if (!store.deleteCharacter(characterId)) return
      const remaining = characters.filter((character) => character.id !== characterId)
      const selection = selectionAfterDelete(remaining, selectedCharacterId, characterId)
      if (selection !== null) setSelectedCharacterId(selection)
    },
  }
}
