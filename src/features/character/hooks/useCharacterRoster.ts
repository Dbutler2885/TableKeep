// Owns character creation and selection-keyed finalize state.
// Declare this hook after spellbook initialization and before store cleanup and justSeeded clearing.

import { useState } from 'react'
import type { CharacterInventoryItem, CharacterRecord } from '../../../types/app'
import {
  type CreationMode,
  HOLY_SYMBOL_REQUIRED,
  addNewCharacter,
  canFinalizeCharacter,
  draftFinalizeError,
  finalizeSelectionKey,
} from '../lib/characterRoster'

type Params = {
  campaignId: string; groupId: string; currentUserId: string; currentUsername: string
  canCreateCharacter: boolean; effectiveSelected: CharacterRecord | null; canEditSelected: boolean
  isGuidedCreation: boolean; isInFinalizationFlow: boolean; hasRolledAbilityScores: boolean
  hasRolledHp: boolean; selectedInventory: CharacterInventoryItem[]
  setSelectedCharacterId: (id: string) => void; isSinglePane: boolean; showDetailPane: () => void
  updateSelectedCharacter: (updates: Partial<CharacterRecord>) => void
  createCharacter: (character: CharacterRecord) => Promise<void>
}

// The confirmation and error are stored with the selection key they were set
// for, so both read as closed and empty once the selection or its status changes.
function useSelectionKeyedFinalizeState(selectionKey: string) {
  const [finalizeConfirmKey, setFinalizeConfirmKey] = useState<string | null>(null)
  const [finalizeErrorState, setFinalizeErrorState] = useState<{ key: string; message: string } | null>(null)
  return {
    finalizeConfirmOpen: finalizeConfirmKey === selectionKey,
    finalizeError: finalizeErrorState?.key === selectionKey ? finalizeErrorState.message : null,
    setFinalizeConfirmOpen: (open: boolean) => setFinalizeConfirmKey(open ? selectionKey : null),
    setFinalizeError: (message: string | null) => setFinalizeErrorState(message ? { key: selectionKey, message } : null),
  }
}

export function useCharacterRoster(params: Params) {
  const [createCharacterModalOpen, setCreateCharacterModalOpen] = useState(false)
  const { finalizeConfirmOpen, setFinalizeConfirmOpen, finalizeError, setFinalizeError } = useSelectionKeyedFinalizeState(finalizeSelectionKey(params.effectiveSelected))
  const [holySymbolRequiredOpen, setHolySymbolRequiredOpen] = useState(false)
  const addCharacter = (creationMode: CreationMode) => addNewCharacter(params, creationMode)
  const requestFinalizeCharacter = () => {
    if (!canFinalizeCharacter(params)) return
    if (params.isGuidedCreation) {
      const error = draftFinalizeError(params)
      if (error) { if (error === HOLY_SYMBOL_REQUIRED) setHolySymbolRequiredOpen(true); else setFinalizeError(error); return }
    }
    setFinalizeError(null)
    setFinalizeConfirmOpen(true)
  }
  const finalizeCharacter = () => {
    if (!canFinalizeCharacter(params)) return
    params.updateSelectedCharacter({ creationStatus: 'active' })
    setFinalizeConfirmOpen(false)
    setFinalizeError(null)
  }

  return { createCharacterModalOpen, setCreateCharacterModalOpen, finalizeConfirmOpen, setFinalizeConfirmOpen, finalizeError, setFinalizeError, holySymbolRequiredOpen, setHolySymbolRequiredOpen, addCharacter, requestFinalizeCharacter, finalizeCharacter }
}
