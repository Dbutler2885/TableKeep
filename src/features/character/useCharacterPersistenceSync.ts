// Owns the seed/reseed/persist effect chain + refs.
// Moved verbatim from CharacterTab — preserve effect ordering exactly.

import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type {
  CharacterRecord,
  CharacterSheetDetails,
  CharacterStoreCartEntry as StoreCartEntry,
  CharacterInventoryItem,
} from '../../types/app'
import type { AbilityScores, SaveScores, AdventureScores, ThiefSkillScores } from './characterRules'
import { emptyAbilityScores } from './characterRules'
import { stableStringify } from './characterFactories'

type Setter<T> = Dispatch<SetStateAction<T>>

type StateMaps = {
  abilityScoresByCharacterId: Record<string, AbilityScores>
  rolledAbilityScoresByCharacterId: Record<string, AbilityScores>
  abilityScoresRolledByCharacterId: Record<string, boolean>
  hpBaseRollByCharacterId: Record<string, number>
  inventoryByCharacterId: Record<string, CharacterInventoryItem[]>
  spellBookSpellIdsByCharacterId: Record<string, string[]>
  memorizedSpellIdsByCharacterId: Record<string, string[]>
  thacoByCharacterId: Record<string, string>
  saveScoresByCharacterId: Record<string, SaveScores>
  adventureScoresByCharacterId: Record<string, AdventureScores>
  adventureSeedClassByCharacterId: Record<string, string>
  thiefSkillsByCharacterId: Record<string, ThiefSkillScores>
  startingGoldByCharacterId: Record<string, number>
  storeSpentByCharacterId: Record<string, number>
  storeCartByCharacterId: Record<string, StoreCartEntry[]>
  alignmentByCharacterId: Record<string, string>
  titleByCharacterId: Record<string, string>
  languagesTextByCharacterId: Record<string, string>
  unencumberingItemsTextByCharacterId: Record<string, string>
  otherNotesTextByCharacterId: Record<string, string>
}

type StateSetters = {
  setAbilityScoresByCharacterId: Setter<Record<string, AbilityScores>>
  setRolledAbilityScoresByCharacterId: Setter<Record<string, AbilityScores>>
  setAbilityScoresRolledByCharacterId: Setter<Record<string, boolean>>
  setHpBaseRollByCharacterId: Setter<Record<string, number>>
  setInventoryByCharacterId: Setter<Record<string, CharacterInventoryItem[]>>
  setSpellBookSpellIdsByCharacterId: Setter<Record<string, string[]>>
  setMemorizedSpellIdsByCharacterId: Setter<Record<string, string[]>>
  setThacoByCharacterId: Setter<Record<string, string>>
  setSaveScoresByCharacterId: Setter<Record<string, SaveScores>>
  setAdventureScoresByCharacterId: Setter<Record<string, AdventureScores>>
  setAdventureSeedClassByCharacterId: Setter<Record<string, string>>
  setThiefSkillsByCharacterId: Setter<Record<string, ThiefSkillScores>>
  setStartingGoldByCharacterId: Setter<Record<string, number>>
  setStoreSpentByCharacterId: Setter<Record<string, number>>
  setStoreCartByCharacterId: Setter<Record<string, StoreCartEntry[]>>
  setAlignmentByCharacterId: Setter<Record<string, string>>
  setTitleByCharacterId: Setter<Record<string, string>>
  setLanguagesTextByCharacterId: Setter<Record<string, string>>
  setUnencumberingItemsTextByCharacterId: Setter<Record<string, string>>
  setOtherNotesTextByCharacterId: Setter<Record<string, string>>
}

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
  const locallyDirtyCharacterIdsRef = useRef<Set<string>>(new Set())
  const updateCharacterRef = useRef(updateCharacter)
  useEffect(() => { updateCharacterRef.current = updateCharacter })

  const {
    setAbilityScoresByCharacterId,
    setRolledAbilityScoresByCharacterId,
    setAbilityScoresRolledByCharacterId,
    setHpBaseRollByCharacterId,
    setInventoryByCharacterId,
    setSpellBookSpellIdsByCharacterId,
    setMemorizedSpellIdsByCharacterId,
    setThacoByCharacterId,
    setSaveScoresByCharacterId,
    setAdventureScoresByCharacterId,
    setAdventureSeedClassByCharacterId,
    setThiefSkillsByCharacterId,
    setStartingGoldByCharacterId,
    setStoreSpentByCharacterId,
    setStoreCartByCharacterId,
    setAlignmentByCharacterId,
    setTitleByCharacterId,
    setLanguagesTextByCharacterId,
    setUnencumberingItemsTextByCharacterId,
    setOtherNotesTextByCharacterId,
  } = stateSetters

  const buildDetailsFromState = (characterId: string): CharacterSheetDetails => ({
    abilityScores: stateMaps.abilityScoresByCharacterId[characterId] ?? emptyAbilityScores(),
    rolledAbilityScores: stateMaps.rolledAbilityScoresByCharacterId[characterId] ?? null,
    abilityScoresRolled: !!stateMaps.abilityScoresRolledByCharacterId[characterId],
    hpBaseRoll: stateMaps.hpBaseRollByCharacterId[characterId] ?? null,
    inventory: stateMaps.inventoryByCharacterId[characterId] ?? [],
    thaco: stateMaps.thacoByCharacterId[characterId] ?? '',
    saveScores: stateMaps.saveScoresByCharacterId[characterId] ?? null,
    adventureScores: stateMaps.adventureScoresByCharacterId[characterId] ?? null,
    adventureSeedClass: stateMaps.adventureSeedClassByCharacterId[characterId] ?? '',
    thiefSkills: stateMaps.thiefSkillsByCharacterId[characterId] ?? null,
    startingGold: stateMaps.startingGoldByCharacterId[characterId] ?? null,
    storeSpent: stateMaps.storeSpentByCharacterId[characterId] ?? 0,
    storeCart: stateMaps.storeCartByCharacterId[characterId] ?? [],
    spellBookSpellIds: stateMaps.spellBookSpellIdsByCharacterId[characterId] ?? [],
    memorizedSpellIds: stateMaps.memorizedSpellIdsByCharacterId[characterId] ?? [],
    alignment: stateMaps.alignmentByCharacterId[characterId] ?? 'Neutrality',
    title: stateMaps.titleByCharacterId[characterId] ?? '',
    languagesText: stateMaps.languagesTextByCharacterId[characterId] ?? '',
    unencumberingItemsText: stateMaps.unencumberingItemsTextByCharacterId[characterId] ?? '',
    otherNotesText: stateMaps.otherNotesTextByCharacterId[characterId] ?? '',
  })

  useEffect(() => {
    if (!selectedCharacterId) return
    if (!seededCharacterIdsRef.current.has(selectedCharacterId)) return
    if (justSeededRef.current.has(selectedCharacterId)) return

    const localJson = stableStringify(buildDetailsFromState(selectedCharacterId))
    if (localJson !== lastPersistedDetailsJsonRef.current[selectedCharacterId]) {
      locallyDirtyCharacterIdsRef.current.add(selectedCharacterId)
    } else {
      locallyDirtyCharacterIdsRef.current.delete(selectedCharacterId)
    }
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

  // Seed local state from Firestore details when characters load
  useEffect(() => {
    for (const character of characters) {
      const id = character.id
      const details = character.details

      const seedInventory = (d: CharacterSheetDetails) => {
        const inv = d.inventory ? (d.inventory as CharacterInventoryItem[]) : migrateToInventory(d)
        setInventoryByCharacterId((prev) => ({ ...prev, [id]: inv }))
      }

      if (!seededCharacterIdsRef.current.has(id)) {
        seededCharacterIdsRef.current.add(id)
        justSeededRef.current.add(id)
        if (details) {
          if (details.abilityScores) setAbilityScoresByCharacterId((prev) => ({ ...prev, [id]: details.abilityScores as AbilityScores }))
          if (details.rolledAbilityScores) setRolledAbilityScoresByCharacterId((prev) => ({ ...prev, [id]: details.rolledAbilityScores as AbilityScores }))
          if (details.abilityScoresRolled) setAbilityScoresRolledByCharacterId((prev) => ({ ...prev, [id]: true }))
          if (typeof details.hpBaseRoll === 'number') setHpBaseRollByCharacterId((prev) => ({ ...prev, [id]: details.hpBaseRoll as number }))
          seedInventory(details)
          if (details.thaco) setThacoByCharacterId((prev) => ({ ...prev, [id]: details.thaco as string }))
          if (details.saveScores) setSaveScoresByCharacterId((prev) => ({ ...prev, [id]: details.saveScores as SaveScores }))
          if (details.adventureScores) setAdventureScoresByCharacterId((prev) => ({ ...prev, [id]: details.adventureScores as AdventureScores }))
          if (details.adventureSeedClass) setAdventureSeedClassByCharacterId((prev) => ({ ...prev, [id]: details.adventureSeedClass as string }))
          if (details.thiefSkills) setThiefSkillsByCharacterId((prev) => ({ ...prev, [id]: details.thiefSkills as ThiefSkillScores }))
          if (typeof details.startingGold === 'number') setStartingGoldByCharacterId((prev) => ({ ...prev, [id]: details.startingGold as number }))
          if (typeof details.storeSpent === 'number') setStoreSpentByCharacterId((prev) => ({ ...prev, [id]: details.storeSpent as number }))
          if (details.storeCart) setStoreCartByCharacterId((prev) => ({ ...prev, [id]: details.storeCart as StoreCartEntry[] }))
          if (details.spellBookSpellIds) setSpellBookSpellIdsByCharacterId((prev) => ({ ...prev, [id]: details.spellBookSpellIds as string[] }))
          if (details.memorizedSpellIds) setMemorizedSpellIdsByCharacterId((prev) => ({ ...prev, [id]: details.memorizedSpellIds as string[] }))
          if (details.alignment) setAlignmentByCharacterId((prev) => ({ ...prev, [id]: details.alignment as string }))
          if (details.title) setTitleByCharacterId((prev) => ({ ...prev, [id]: details.title as string }))
          if (typeof details.languagesText === 'string') setLanguagesTextByCharacterId((prev) => ({ ...prev, [id]: details.languagesText as string }))
          if (typeof details.unencumberingItemsText === 'string') setUnencumberingItemsTextByCharacterId((prev) => ({ ...prev, [id]: details.unencumberingItemsText as string }))
          if (typeof details.otherNotesText === 'string') setOtherNotesTextByCharacterId((prev) => ({ ...prev, [id]: details.otherNotesText as string }))
        }
        lastPersistedDetailsJsonRef.current[id] = stableStringify(details ?? null)
        continue
      }

      // Re-seed from Firestore if another user edited (no pending local write)
      if (!hasPendingWrite(id) && !locallyDirtyCharacterIdsRef.current.has(id) && details) {
        const incomingJson = stableStringify(details)
        if (incomingJson !== lastPersistedDetailsJsonRef.current[id]) {
          lastPersistedDetailsJsonRef.current[id] = incomingJson
          setAbilityScoresByCharacterId((prev) => ({ ...prev, [id]: (details.abilityScores as AbilityScores) ?? emptyAbilityScores() }))
          setRolledAbilityScoresByCharacterId((prev) => details.rolledAbilityScores ? { ...prev, [id]: details.rolledAbilityScores as AbilityScores } : prev)
          setAbilityScoresRolledByCharacterId((prev) => ({ ...prev, [id]: !!details.abilityScoresRolled }))
          setHpBaseRollByCharacterId((prev) => typeof details.hpBaseRoll === 'number' ? { ...prev, [id]: details.hpBaseRoll } : prev)
          seedInventory(details)
          setThacoByCharacterId((prev) => ({ ...prev, [id]: (details.thaco as string) ?? '' }))
          setSaveScoresByCharacterId((prev) => details.saveScores ? { ...prev, [id]: details.saveScores as SaveScores } : prev)
          setAdventureScoresByCharacterId((prev) => details.adventureScores ? { ...prev, [id]: details.adventureScores as AdventureScores } : prev)
          setAdventureSeedClassByCharacterId((prev) => details.adventureSeedClass ? { ...prev, [id]: details.adventureSeedClass } : prev)
          setThiefSkillsByCharacterId((prev) => details.thiefSkills ? { ...prev, [id]: details.thiefSkills as ThiefSkillScores } : prev)
          setStartingGoldByCharacterId((prev) => typeof details.startingGold === 'number' ? { ...prev, [id]: details.startingGold } : prev)
          setStoreSpentByCharacterId((prev) => typeof details.storeSpent === 'number' ? { ...prev, [id]: details.storeSpent } : prev)
          setStoreCartByCharacterId((prev) => details.storeCart ? { ...prev, [id]: details.storeCart as StoreCartEntry[] } : prev)
          setSpellBookSpellIdsByCharacterId((prev) => ({ ...prev, [id]: (details.spellBookSpellIds as string[]) ?? [] }))
          setMemorizedSpellIdsByCharacterId((prev) => ({ ...prev, [id]: (details.memorizedSpellIds as string[]) ?? [] }))
          setAlignmentByCharacterId((prev) => details.alignment ? { ...prev, [id]: details.alignment } : prev)
          setTitleByCharacterId((prev) => details.title ? { ...prev, [id]: details.title } : prev)
          setLanguagesTextByCharacterId((prev) => ({ ...prev, [id]: typeof details.languagesText === 'string' ? details.languagesText : '' }))
          setUnencumberingItemsTextByCharacterId((prev) => ({ ...prev, [id]: typeof details.unencumberingItemsText === 'string' ? details.unencumberingItemsText : '' }))
          setOtherNotesTextByCharacterId((prev) => ({ ...prev, [id]: typeof details.otherNotesText === 'string' ? details.otherNotesText : '' }))
        }
      }
    }
  }, [characters, hasPendingWrite])

  // Persist local detail state to Firestore when it changes
  useEffect(() => {
    if (!selectedCharacterId) return
    if (!seededCharacterIdsRef.current.has(selectedCharacterId)) return
    // Skip the render immediately after seeding — state updates haven't been processed yet
    if (justSeededRef.current.has(selectedCharacterId)) return

    const details = buildDetailsFromState(selectedCharacterId)

    const json = stableStringify(details)
    if (json === lastPersistedDetailsJsonRef.current[selectedCharacterId]) return
    lastPersistedDetailsJsonRef.current[selectedCharacterId] = json
    locallyDirtyCharacterIdsRef.current.delete(selectedCharacterId)
    updateCharacterRef.current(selectedCharacterId, { details })
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
