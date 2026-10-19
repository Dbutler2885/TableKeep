// Owns the seed/reseed/persist effect chain and its refs.
// Declare this hook before all derived-state hooks and before the orchestrator's justSeeded clearing effect.

import { useEffect, useEffectEvent, useRef } from 'react'
import type { CharacterRecord, CharacterSheetDetails, CharacterInventoryItem } from '../../../types/app'
import {
  markLocalDetailsDirty,
  markLocalInventoriesDirty,
  persistSelectedDetails,
  syncCharactersFromStore,
  type PersistenceSyncRefs,
} from '../lib/characterPersistenceSync'
import type { StateMaps, StateSetters } from '../lib/characterSheetFields'

type Params = {
  selectedCharacterId: string
  characters: CharacterRecord[]
  hasPendingWrite: (id: string) => boolean
  updateCharacter: (characterId: string, updates: Partial<CharacterRecord>) => void
  migrateToInventory: (details: CharacterSheetDetails) => CharacterInventoryItem[]
  stateMaps: StateMaps
  stateSetters: StateSetters
}

export function useCharacterPersistenceSync({
  selectedCharacterId,
  characters,
  hasPendingWrite,
  updateCharacter,
  migrateToInventory,
  stateMaps,
  stateSetters,
}: Params) {
  const seededCharacterIdsRef = useRef<Set<string>>(new Set())
  const justSeededRef = useRef<Set<string>>(new Set())
  const lastPersistedDetailsJsonRef = useRef<Record<string, string>>({})
  const lastPersistedInventoryJsonRef = useRef<Record<string, string>>({})
  const locallyDirtyCharacterIdsRef = useRef<Set<string>>(new Set())
  const locallyDirtyInventoryCharacterIdsRef = useRef<Set<string>>(new Set())
  const updateCharacterRef = useRef(updateCharacter)
  useEffect(() => { updateCharacterRef.current = updateCharacter })

  const refs: PersistenceSyncRefs = {
    seededCharacterIdsRef,
    justSeededRef,
    lastPersistedDetailsJsonRef,
    lastPersistedInventoryJsonRef,
    locallyDirtyCharacterIdsRef,
    locallyDirtyInventoryCharacterIdsRef,
  }

  // Each effect keeps its original dependency list and reads the rest of this render through an effect event.
  const markDetailsDirty = useEffectEvent(() => markLocalDetailsDirty(selectedCharacterId, stateMaps, refs))
  useEffect(() => {
    markDetailsDirty()
  }, [
    selectedCharacterId,
    stateMaps.abilityScoresByCharacterId,
    stateMaps.rolledAbilityScoresByCharacterId,
    stateMaps.abilityScoresRolledByCharacterId,
    stateMaps.hpBaseRollByCharacterId,
    stateMaps.inventoryByCharacterId,
    stateMaps.thacoByCharacterId,
    stateMaps.saveScoresByCharacterId,
    stateMaps.adventureScoresByCharacterId,
    stateMaps.adventureSeedClassByCharacterId,
    stateMaps.thiefSkillsByCharacterId,
    stateMaps.startingGoldByCharacterId,
    stateMaps.storeSpentByCharacterId,
    stateMaps.storeCartByCharacterId,
    stateMaps.spellBookSpellIdsByCharacterId,
    stateMaps.memorizedSpellIdsByCharacterId,
    stateMaps.alignmentByCharacterId,
    stateMaps.titleByCharacterId,
    stateMaps.languagesTextByCharacterId,
    stateMaps.unencumberingItemsTextByCharacterId,
    stateMaps.otherNotesTextByCharacterId,
  ])

  const markInventoriesDirty = useEffectEvent(() => markLocalInventoriesDirty(characters, stateMaps.inventoryByCharacterId, refs))
  useEffect(() => {
    markInventoriesDirty()
  }, [characters, stateMaps.inventoryByCharacterId])

  // Seed local state from Firestore details when characters load
  const syncFromStore = useEffectEvent(() =>
    syncCharactersFromStore(characters, { hasPendingWrite, migrateToInventory, setters: stateSetters, refs }))
  useEffect(() => {
    syncFromStore()
  }, [characters, hasPendingWrite])

  // Persist local detail state to Firestore when it changes
  const persistDetails = useEffectEvent(() =>
    persistSelectedDetails(selectedCharacterId, stateMaps, refs, updateCharacterRef.current))
  useEffect(() => {
    persistDetails()
  }, [
    selectedCharacterId,
    stateMaps.abilityScoresByCharacterId,
    stateMaps.rolledAbilityScoresByCharacterId,
    stateMaps.abilityScoresRolledByCharacterId,
    stateMaps.hpBaseRollByCharacterId,
    stateMaps.inventoryByCharacterId,
    stateMaps.thacoByCharacterId,
    stateMaps.saveScoresByCharacterId,
    stateMaps.adventureScoresByCharacterId,
    stateMaps.adventureSeedClassByCharacterId,
    stateMaps.thiefSkillsByCharacterId,
    stateMaps.startingGoldByCharacterId,
    stateMaps.storeSpentByCharacterId,
    stateMaps.storeCartByCharacterId,
    stateMaps.spellBookSpellIdsByCharacterId,
    stateMaps.memorizedSpellIdsByCharacterId,
    stateMaps.alignmentByCharacterId,
    stateMaps.titleByCharacterId,
    stateMaps.languagesTextByCharacterId,
    stateMaps.unencumberingItemsTextByCharacterId,
    stateMaps.otherNotesTextByCharacterId,
  ])

  return {
    seededCharacterIdsRef,
    justSeededRef,
    lastPersistedDetailsJsonRef,
  }
}
