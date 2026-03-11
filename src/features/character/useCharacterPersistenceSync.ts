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
  acManualOverrideByCharacterId: Record<string, boolean>
  startingGoldByCharacterId: Record<string, number>
  storeSpentByCharacterId: Record<string, number>
  storeCartByCharacterId: Record<string, StoreCartEntry[]>
  alignmentByCharacterId: Record<string, string>
  titleByCharacterId: Record<string, string>
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
  setAcManualOverrideByCharacterId: Setter<Record<string, boolean>>
  setStartingGoldByCharacterId: Setter<Record<string, number>>
  setStoreSpentByCharacterId: Setter<Record<string, number>>
  setStoreCartByCharacterId: Setter<Record<string, StoreCartEntry[]>>
  setAlignmentByCharacterId: Setter<Record<string, string>>
  setTitleByCharacterId: Setter<Record<string, string>>
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
    setAcManualOverrideByCharacterId,
    setStartingGoldByCharacterId,
    setStoreSpentByCharacterId,
    setStoreCartByCharacterId,
    setAlignmentByCharacterId,
    setTitleByCharacterId,
  } = stateSetters

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
          if (details.acManualOverride) setAcManualOverrideByCharacterId((prev) => ({ ...prev, [id]: true }))
          if (typeof details.startingGold === 'number') setStartingGoldByCharacterId((prev) => ({ ...prev, [id]: details.startingGold as number }))
          if (typeof details.storeSpent === 'number') setStoreSpentByCharacterId((prev) => ({ ...prev, [id]: details.storeSpent as number }))
          if (details.storeCart) setStoreCartByCharacterId((prev) => ({ ...prev, [id]: details.storeCart as StoreCartEntry[] }))
          if (details.spellBookSpellIds) setSpellBookSpellIdsByCharacterId((prev) => ({ ...prev, [id]: details.spellBookSpellIds as string[] }))
          if (details.memorizedSpellIds) setMemorizedSpellIdsByCharacterId((prev) => ({ ...prev, [id]: details.memorizedSpellIds as string[] }))
          if (details.alignment) setAlignmentByCharacterId((prev) => ({ ...prev, [id]: details.alignment as string }))
          if (details.title) setTitleByCharacterId((prev) => ({ ...prev, [id]: details.title as string }))
        }
        lastPersistedDetailsJsonRef.current[id] = stableStringify(details ?? null)
        continue
      }

      // Re-seed from Firestore if another user edited (no pending local write)
      if (!hasPendingWrite(id) && details) {
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
          setAcManualOverrideByCharacterId((prev) => ({ ...prev, [id]: !!details.acManualOverride }))
          setStartingGoldByCharacterId((prev) => typeof details.startingGold === 'number' ? { ...prev, [id]: details.startingGold } : prev)
          setStoreSpentByCharacterId((prev) => typeof details.storeSpent === 'number' ? { ...prev, [id]: details.storeSpent } : prev)
          setStoreCartByCharacterId((prev) => details.storeCart ? { ...prev, [id]: details.storeCart as StoreCartEntry[] } : prev)
          setSpellBookSpellIdsByCharacterId((prev) => ({ ...prev, [id]: (details.spellBookSpellIds as string[]) ?? [] }))
          setMemorizedSpellIdsByCharacterId((prev) => ({ ...prev, [id]: (details.memorizedSpellIds as string[]) ?? [] }))
          setAlignmentByCharacterId((prev) => details.alignment ? { ...prev, [id]: details.alignment } : prev)
          setTitleByCharacterId((prev) => details.title ? { ...prev, [id]: details.title } : prev)
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

    const details: CharacterSheetDetails = {
      abilityScores: stateMaps.abilityScoresByCharacterId[selectedCharacterId] ?? emptyAbilityScores(),
      rolledAbilityScores: stateMaps.rolledAbilityScoresByCharacterId[selectedCharacterId] ?? null,
      abilityScoresRolled: !!stateMaps.abilityScoresRolledByCharacterId[selectedCharacterId],
      hpBaseRoll: stateMaps.hpBaseRollByCharacterId[selectedCharacterId] ?? null,
      inventory: stateMaps.inventoryByCharacterId[selectedCharacterId] ?? [],
      thaco: stateMaps.thacoByCharacterId[selectedCharacterId] ?? '',
      saveScores: stateMaps.saveScoresByCharacterId[selectedCharacterId] ?? null,
      adventureScores: stateMaps.adventureScoresByCharacterId[selectedCharacterId] ?? null,
      adventureSeedClass: stateMaps.adventureSeedClassByCharacterId[selectedCharacterId] ?? '',
      thiefSkills: stateMaps.thiefSkillsByCharacterId[selectedCharacterId] ?? null,
      acManualOverride: !!stateMaps.acManualOverrideByCharacterId[selectedCharacterId],
      startingGold: stateMaps.startingGoldByCharacterId[selectedCharacterId] ?? null,
      storeSpent: stateMaps.storeSpentByCharacterId[selectedCharacterId] ?? 0,
      storeCart: stateMaps.storeCartByCharacterId[selectedCharacterId] ?? [],
      spellBookSpellIds: stateMaps.spellBookSpellIdsByCharacterId[selectedCharacterId] ?? [],
      memorizedSpellIds: stateMaps.memorizedSpellIdsByCharacterId[selectedCharacterId] ?? [],
      alignment: stateMaps.alignmentByCharacterId[selectedCharacterId] ?? 'Neutrality',
      title: stateMaps.titleByCharacterId[selectedCharacterId] ?? '',
    }

    const json = stableStringify(details)
    if (json === lastPersistedDetailsJsonRef.current[selectedCharacterId]) return
    lastPersistedDetailsJsonRef.current[selectedCharacterId] = json
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
    stateMaps.acManualOverrideByCharacterId,
    stateMaps.startingGoldByCharacterId,
    stateMaps.storeSpentByCharacterId,
    stateMaps.storeCartByCharacterId,
    stateMaps.spellBookSpellIdsByCharacterId,
    stateMaps.memorizedSpellIdsByCharacterId,
    stateMaps.alignmentByCharacterId,
    stateMaps.titleByCharacterId,
  ])

  return {
    seededCharacterIdsRef,
    justSeededRef,
  }
}
