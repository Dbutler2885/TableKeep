// Character-list and item-detail handlers the tab hands to its panes and modals.

import type { CharacterInventoryItem, CharacterRecord } from '../../../types/app'
import type { CharacterPaneView } from '../characterPaneLayout'

type CharacterListSelection = {
  effectiveGrantMode: boolean
  isSinglePane: boolean
  exitGrantModeForCharacterSelection: () => void
  resetLevelUpForCharacterSelection: () => void
  setSelectedCharacterId: (id: string) => void
  setPaneView: (view: CharacterPaneView) => void
}

/** Choosing a character leaves grant mode and any level-up in progress, and shows the sheet on a single-pane layout. */
export function selectCharacterFromList(selection: CharacterListSelection, characterId: string) {
  if (selection.effectiveGrantMode) {
    selection.exitGrantModeForCharacterSelection()
  }
  selection.resetLevelUpForCharacterSelection()
  selection.setSelectedCharacterId(characterId)
  if (selection.isSinglePane) selection.setPaneView('detail')
}

export function deleteConfirmTargetFor(character: Pick<CharacterRecord, 'id' | 'name'>) {
  return { id: character.id, name: character.name || 'character' }
}

/** The inventory item the detail modal shows, or null when it is closed or the item is gone. */
export function detailItemFor(inventory: CharacterInventoryItem[], itemDetailId: string | null) {
  return itemDetailId ? inventory.find((item) => item.id === itemDetailId) ?? null : null
}
