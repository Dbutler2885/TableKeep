import { useState } from 'react'
import { db } from '../../firebase'
import type { Role } from '../../types/app'
import type { CharacterStoreRemove } from '../character/characterStore/characterStoreActions'
import type { CharacterDeleteTarget } from '../character/components/CharacterDeleteDialog'
import { canDeleteCharacterForRole } from '../character/lib/characterPermissions'
import { selectionAfterDelete } from '../character/lib/characterSnapshot'
import { deleteConfirmTargetFor } from '../character/lib/characterTabHandlers'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import type { LubecDropper } from '../ruleSets/lubec/gear/containers'
import { lubecDeleteCharacterDroppingGear } from './gear/lubecDeleteDrop'
import { lubecMoveStoreOf, type LubecGearDropStore } from './gear/lubecGearDrop'
import { quietSheets } from './gear/lubecMoveTransaction'
import { lubecCharacterName } from './lubecNames'

export type LubecDeleteStore = LubecGearDropStore & {
  characters: LubecCharacterRecord[]
  selectedCharacterId: string
  setSelectedCharacterId: (characterId: string) => void
  deleteCharacter: (characterId: string, remove?: CharacterStoreRemove) => boolean
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

type Viewer = { role: Role | null; userId: string }

/**
 * Deletes a character through the shared store, then, as OSE does, opens the
 * first one left when the open one went, or nothing once none is left.
 */
export function deleteLubecCharacter(store: LubecDeleteStore, characterId: string, remove?: CharacterStoreRemove): boolean {
  if (!store.deleteCharacter(characterId, remove)) return false
  const remaining = store.characters.filter((character) => character.id !== characterId)
  const selection = selectionAfterDelete(remaining, store.selectedCharacterId, characterId)
  if (selection !== null) store.setSelectedCharacterId(selection)
  return true
}

// Settled rule 7: the character's things go to the GM's Items tab as dropped, in the transaction that deletes it.
const removeDroppingGear = (dropper: LubecDropper, setError: (message: string) => void): CharacterStoreRemove =>
  (campaign) => lubecDeleteCharacterDroppingGear(db, campaign, dropper)
    .catch(() => setError(`Could not delete ${dropper.characterName}. Nothing changed.`))

/**
 * Deletes a character and drops everything it had to the GM's Items tab. Its
 * waiting save is sent and lands first, so its things are read as last edited.
 */
export async function deleteLubecCharacterDroppingGear(
  store: LubecDeleteStore,
  character: LubecCharacterRecord,
  viewer: Viewer,
  setError: (message: string) => void,
): Promise<boolean> {
  await quietSheets(lubecMoveStoreOf(store), [character.id])
  const dropper = { characterId: character.id, characterName: lubecCharacterName(character), userId: viewer.userId }
  return deleteLubecCharacter(store, character.id, removeDroppingGear(dropper, setError))
}

/** The owner and the GM delete a character at any stage, from the roster or the sheet, once they confirm. */
export function useLubecCharacterDelete(
  store: LubecDeleteStore,
  viewer: Viewer,
  onDeleted: () => void,
  setError: (message: string) => void,
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
      const character = store.characters.find((c) => c.id === id)
      if (!character) return
      void deleteLubecCharacterDroppingGear(store, character, viewer, setError).then((deleted) => {
        if (deleted) onDeleted()
      })
    },
    cancel: () => setTarget(null),
  }
}
