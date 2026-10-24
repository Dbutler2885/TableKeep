// Character creation and finalization rules behind useCharacterRoster.

import type { CharacterInventoryItem, CharacterRecord } from '../../../types/app'
import { makeId } from '../characterFactories'
import { defaultTokenIcon } from './characterSheetLayout'

export type CreationMode = 'new' | 'established'

/** The validation result that opens the holy symbol dialog instead of showing an error. */
export const HOLY_SYMBOL_REQUIRED = 'HOLY_SYMBOL_REQUIRED'

export function newCharacterRecord(creationMode: CreationMode, ownerUserId: string, ownerUsername: string): CharacterRecord {
  return { id: makeId(), name: 'New Character', ownerUserId, ownerUsername, creationMode, creationModeExplicit: true, creationStatus: creationMode === 'new' ? 'draft' : 'established_draft', className: '-', level: 1, hpCurrent: 0, hpMax: 0, ac: 10, xp: 0, portraitPath: '', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: defaultTokenIcon }
}

type CharacterCreation = {
  canCreateCharacter: boolean
  currentUserId: string
  currentUsername: string
  isSinglePane: boolean
  setSelectedCharacterId: (id: string) => void
  showDetailPane: () => void
  createCharacter: (character: CharacterRecord) => Promise<void>
}

/** Creates a character owned by the current user, selects it, and shows its sheet on a single-pane layout. */
export function addNewCharacter(creation: CharacterCreation, creationMode: CreationMode) {
  if (!creation.canCreateCharacter) return
  const next = newCharacterRecord(creationMode, creation.currentUserId, creation.currentUsername)
  creation.setSelectedCharacterId(next.id)
  if (creation.isSinglePane) creation.showDetailPane()
  void creation.createCharacter(next)
}

type FinalizeGate = {
  effectiveSelected: CharacterRecord | null
  canEditSelected: boolean
  isInFinalizationFlow: boolean
}

export function canFinalizeCharacter({ effectiveSelected, canEditSelected, isInFinalizationFlow }: FinalizeGate) {
  return !!effectiveSelected && canEditSelected && isInFinalizationFlow
}

/** Finalize confirmation and errors belong to one character in one creation status. */
export function finalizeSelectionKey(effectiveSelected: CharacterRecord | null) {
  return effectiveSelected ? `${effectiveSelected.id}:${effectiveSelected.creationStatus}` : ''
}

export function carriesHolySymbol(inventory: CharacterInventoryItem[]) {
  return inventory.some((item) => (item.name ?? '').toLowerCase().includes('holy symbol'))
}

/** A cleric must carry an item named as a holy symbol to be finalized. */
export function needsHolySymbol(character: CharacterRecord, inventory: CharacterInventoryItem[]) {
  return character.className === 'Cleric' && !carriesHolySymbol(inventory)
}

type DraftCheck = {
  effectiveSelected: CharacterRecord | null
  hasRolledAbilityScores: boolean
  hasRolledHp: boolean
  selectedInventory: CharacterInventoryItem[]
}

function missingRollError({ hasRolledAbilityScores, hasRolledHp }: DraftCheck) {
  if (!hasRolledAbilityScores) return 'Roll ability scores before finalizing.'
  if (!hasRolledHp) return 'Roll hit points before finalizing.'
  return null
}

/** The first thing a guided draft lacks before it can be finalized, or null when it is ready. */
export function draftFinalizeError(check: DraftCheck) {
  const selected = check.effectiveSelected
  if (!selected) return 'No character selected.'
  if (selected.className === '-') return 'Choose a class before finalizing.'
  const rollError = missingRollError(check)
  if (rollError) return rollError
  if (selected.hpMax <= 0) return 'Set maximum hit points before finalizing.'
  if (needsHolySymbol(selected, check.selectedInventory)) return HOLY_SYMBOL_REQUIRED
  return null
}
