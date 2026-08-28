// Owns character creation and selection-keyed finalize state.
// Declare this hook after spellbook initialization and before store cleanup and justSeeded clearing.

import { useState } from 'react'
import { serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { CharacterInventoryItem, CharacterRecord } from '../../../types/app'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { sanitizeTokenIconForPersistence } from '../../common/mediaStorage'
import { makeId } from '../characterFactories'
import { defaultTokenIcon } from '../lib/characterSheetLayout'

type Params = {
  campaignId: string; groupId: string; currentUserId: string; currentUsername: string
  canCreateCharacter: boolean; effectiveSelected: CharacterRecord | null; canEditSelected: boolean
  isGuidedCreation: boolean; isInFinalizationFlow: boolean; hasRolledAbilityScores: boolean
  hasRolledHp: boolean; selectedInventory: CharacterInventoryItem[]
  setSelectedCharacterId: (id: string) => void; isSinglePane: boolean; showDetailPane: () => void
  updateSelectedCharacter: (updates: Partial<CharacterRecord>) => void
}

export function useCharacterRoster(params: Params) {
  const [createCharacterModalOpen, setCreateCharacterModalOpen] = useState(false)
  const selectionKey = params.effectiveSelected ? `${params.effectiveSelected.id}:${params.effectiveSelected.creationStatus}` : ''
  const [finalizeConfirmKey, setFinalizeConfirmKey] = useState<string | null>(null)
  const [finalizeErrorState, setFinalizeErrorState] = useState<{ key: string; message: string } | null>(null)
  const finalizeConfirmOpen = finalizeConfirmKey === selectionKey
  const finalizeError = finalizeErrorState?.key === selectionKey ? finalizeErrorState.message : null
  const setFinalizeConfirmOpen = (open: boolean) => setFinalizeConfirmKey(open ? selectionKey : null)
  const setFinalizeError = (message: string | null) => setFinalizeErrorState(message ? { key: selectionKey, message } : null)
  const [holySymbolRequiredOpen, setHolySymbolRequiredOpen] = useState(false)
  const addCharacter = (creationMode: 'new' | 'established') => {
    if (!params.canCreateCharacter) return
    const next: CharacterRecord = { id: makeId(), name: 'New Character', ownerUserId: params.currentUserId, ownerUsername: params.currentUsername, creationMode, creationModeExplicit: true, creationStatus: creationMode === 'new' ? 'draft' : 'established_draft', className: '-', level: 1, hpCurrent: 0, hpMax: 0, ac: 10, xp: 0, portraitPath: '', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: defaultTokenIcon }
    params.setSelectedCharacterId(next.id)
    if (params.isSinglePane) params.showDetailPane()
    void setDoc(campaignDocRef(db, { campaignId: params.campaignId, groupId: params.groupId }, 'characters', next.id), { name: next.name, ownerUserId: next.ownerUserId, ownerUsername: next.ownerUsername ?? null, creationMode: next.creationMode, creationModeExplicit: next.creationModeExplicit, creationStatus: next.creationStatus, class: next.className, level: next.level, hpCurrent: next.hpCurrent, hpMax: next.hpMax, ac: next.ac, xp: next.xp, portraitPath: next.portraitPath ?? '', portraitFocusX: next.portraitFocusX, portraitFocusY: next.portraitFocusY, tokenIcon: sanitizeTokenIconForPersistence(next.tokenIcon), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  }
  const validateDraftCharacter = () => {
    const selected = params.effectiveSelected
    if (!selected) return 'No character selected.'
    if (selected.className === '-') return 'Choose a class before finalizing.'
    if (!params.hasRolledAbilityScores) return 'Roll ability scores before finalizing.'
    if (!params.hasRolledHp) return 'Roll hit points before finalizing.'
    if (selected.hpMax <= 0) return 'Set maximum hit points before finalizing.'
    if (selected.className === 'Cleric' && !params.selectedInventory.some((item) => (item.name ?? '').toLowerCase().includes('holy symbol'))) return 'HOLY_SYMBOL_REQUIRED'
    return null
  }
  const requestFinalizeCharacter = () => {
    if (!params.effectiveSelected || !params.canEditSelected || !params.isInFinalizationFlow) return
    if (params.isGuidedCreation) {
      const error = validateDraftCharacter()
      if (error) { if (error === 'HOLY_SYMBOL_REQUIRED') setHolySymbolRequiredOpen(true); else setFinalizeError(error); return }
    }
    setFinalizeError(null)
    setFinalizeConfirmOpen(true)
  }
  const finalizeCharacter = () => {
    if (!params.effectiveSelected || !params.canEditSelected || !params.isInFinalizationFlow) return
    params.updateSelectedCharacter({ creationStatus: 'active' })
    setFinalizeConfirmOpen(false)
    setFinalizeError(null)
  }

  return { createCharacterModalOpen, setCreateCharacterModalOpen, finalizeConfirmOpen, setFinalizeConfirmOpen, finalizeError, setFinalizeError, holySymbolRequiredOpen, setHolySymbolRequiredOpen, addCharacter, requestFinalizeCharacter, finalizeCharacter }
}
