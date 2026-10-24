// Owns the roster order, the sheet's effective selection, and the auto-select-first-character effect.
// Declare this hook after useCharacterPersistenceSync and before the orchestrator's justSeeded clearing effect.

import { useEffect, useMemo } from 'react'
import { resolveEffectiveSelected, sortCharactersByTier, visibleCharactersFor } from '../lib/characterSelection'
import type { CharacterTabProps } from '../lib/characterTabTypes'

type Params = Pick<CharacterTabProps,
  'characters' | 'role' | 'gmUserId' | 'currentUserId' | 'currentCharacterId'
  | 'selectedCharacter' | 'selectedCharacterId' | 'setSelectedCharacterId'
> & { embeddedMode: boolean }

export function useCharacterSelection({
  characters, role, gmUserId, currentUserId, currentCharacterId,
  selectedCharacter, selectedCharacterId, setSelectedCharacterId, embeddedMode,
}: Params) {
  const visibleCharacters = useMemo(
    () => visibleCharactersFor({ characters, embeddedMode, role, currentCharacterId, currentUserId }),
    [characters, currentCharacterId, currentUserId, embeddedMode, role],
  )
  const sortedCharacters = useMemo(() => sortCharactersByTier(visibleCharacters, gmUserId), [visibleCharacters, gmUserId])
  const effectiveSelected = resolveEffectiveSelected({ embeddedMode, sortedCharacters, selectedCharacter, selectedCharacterId })

  useEffect(() => {
    if (embeddedMode || sortedCharacters.length === 0) return
    if (!effectiveSelected) {
      setSelectedCharacterId(sortedCharacters[0].id)
    }
  }, [effectiveSelected, embeddedMode, setSelectedCharacterId, sortedCharacters])

  return { sortedCharacters, effectiveSelected }
}
