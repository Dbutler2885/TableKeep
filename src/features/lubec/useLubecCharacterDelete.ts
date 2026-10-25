import { useState } from 'react'
import type { Role } from '../../types/app'
import type { CharacterDeleteTarget } from '../character/components/CharacterDeleteDialog'
import { canDeleteCharacterForRole } from '../character/lib/characterPermissions'
import { selectionAfterDelete } from '../character/lib/characterSnapshot'
import { deleteConfirmTargetFor } from '../character/lib/characterTabHandlers'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { lubecCharacterName } from './lubecNames'

export type LubecDeleteStore = {
  characters: LubecCharacterRecord[]
  selectedCharacterId: string
  setSelectedCharacterId: (characterId: string) => void
  deleteCharacter: (characterId: string) => boolean
}

/** Asks to delete a character; null when the viewer may not. */
export type LubecDeleteFor = (character: LubecCharacterRecord | null) => (() => void) | null

export type LubecCharacterDelete = {
  /** The character waiting on the confirmation, or null when none is. */
  target: CharacterDeleteTarget | null
  deleteFor: LubecDeleteFor
  confirm: (target: CharacterDeleteTarget) => void
  cancel: () => void
}

/**
 * Deletes a character through the shared store, then, as OSE does, opens the
 * first one left when the open one went, or nothing once none is left.
 */
export function deleteLubecCharacter(store: LubecDeleteStore, characterId: string): boolean {
  if (!store.deleteCharacter(characterId)) return false
  const remaining = store.characters.filter((character) => character.id !== characterId)
  const selection = selectionAfterDelete(remaining, store.selectedCharacterId, characterId)
  if (selection !== null) store.setSelectedCharacterId(selection)
  return true
}

/** The owner and the GM delete a character at any stage, from the roster or the sheet, once they confirm. */
export function useLubecCharacterDelete(
  store: LubecDeleteStore,
  viewer: { role: Role | null; userId: string },
  onDeleted: () => void,
): LubecCharacterDelete {
  const [target, setTarget] = useState<CharacterDeleteTarget | null>(null)
  return {
    target,
    deleteFor: (character) => {
      if (!character || !canDeleteCharacterForRole(viewer.role, viewer.userId, character)) return null
      return () => setTarget(deleteConfirmTargetFor({ id: character.id, name: lubecCharacterName(character) }))
    },
    confirm: ({ id }) => {
      setTarget(null)
      if (deleteLubecCharacter(store, id)) onDeleted()
    },
    cancel: () => setTarget(null),
  }
}
