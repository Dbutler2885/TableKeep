import { useState } from 'react'
import type { CharacterInventoryItem, CharacterStoreCartEntry as StoreCartEntry } from '../../../types/app'
import type { AbilityScores, AdventureScores, SaveScores, ThiefSkillScores } from '../characterRules'

export function useCharacterSheetState() {
  const [abilityScoresByCharacterId, setAbilityScoresByCharacterId] = useState<Record<string, AbilityScores>>({})
  const [rolledAbilityScoresByCharacterId, setRolledAbilityScoresByCharacterId] = useState<Record<string, AbilityScores>>({})
  const [abilityScoresRolledByCharacterId, setAbilityScoresRolledByCharacterId] = useState<Record<string, boolean>>({})
  const [hpBaseRollByCharacterId, setHpBaseRollByCharacterId] = useState<Record<string, number>>({})
  const [inventoryByCharacterId, setInventoryByCharacterId] = useState<Record<string, CharacterInventoryItem[]>>({})
  const [spellBookSpellIdsByCharacterId, setSpellBookSpellIdsByCharacterId] = useState<Record<string, string[]>>({})
  const [memorizedSpellIdsByCharacterId, setMemorizedSpellIdsByCharacterId] = useState<Record<string, string[]>>({})
  const [thacoByCharacterId, setThacoByCharacterId] = useState<Record<string, string>>({})
  const [saveScoresByCharacterId, setSaveScoresByCharacterId] = useState<Record<string, SaveScores>>({})
  const [adventureScoresByCharacterId, setAdventureScoresByCharacterId] = useState<Record<string, AdventureScores>>({})
  const [adventureSeedClassByCharacterId, setAdventureSeedClassByCharacterId] = useState<Record<string, string>>({})
  const [thiefSkillsByCharacterId, setThiefSkillsByCharacterId] = useState<Record<string, ThiefSkillScores>>({})
  const [startingGoldByCharacterId, setStartingGoldByCharacterId] = useState<Record<string, number>>({})
  const [storeSpentByCharacterId, setStoreSpentByCharacterId] = useState<Record<string, number>>({})
  const [storeCartByCharacterId, setStoreCartByCharacterId] = useState<Record<string, StoreCartEntry[]>>({})
  const [alignmentByCharacterId, setAlignmentByCharacterId] = useState<Record<string, string>>({})
  const [titleByCharacterId, setTitleByCharacterId] = useState<Record<string, string>>({})
  const [languagesTextByCharacterId, setLanguagesTextByCharacterId] = useState<Record<string, string>>({})
  const [unencumberingItemsTextByCharacterId, setUnencumberingItemsTextByCharacterId] = useState<Record<string, string>>({})
  const [otherNotesTextByCharacterId, setOtherNotesTextByCharacterId] = useState<Record<string, string>>({})

  return {
    stateMaps: { abilityScoresByCharacterId, rolledAbilityScoresByCharacterId, abilityScoresRolledByCharacterId, hpBaseRollByCharacterId, inventoryByCharacterId, spellBookSpellIdsByCharacterId, memorizedSpellIdsByCharacterId, thacoByCharacterId, saveScoresByCharacterId, adventureScoresByCharacterId, adventureSeedClassByCharacterId, thiefSkillsByCharacterId, startingGoldByCharacterId, storeSpentByCharacterId, storeCartByCharacterId, alignmentByCharacterId, titleByCharacterId, languagesTextByCharacterId, unencumberingItemsTextByCharacterId, otherNotesTextByCharacterId },
    stateSetters: { setAbilityScoresByCharacterId, setRolledAbilityScoresByCharacterId, setAbilityScoresRolledByCharacterId, setHpBaseRollByCharacterId, setInventoryByCharacterId, setSpellBookSpellIdsByCharacterId, setMemorizedSpellIdsByCharacterId, setThacoByCharacterId, setSaveScoresByCharacterId, setAdventureScoresByCharacterId, setAdventureSeedClassByCharacterId, setThiefSkillsByCharacterId, setStartingGoldByCharacterId, setStoreSpentByCharacterId, setStoreCartByCharacterId, setAlignmentByCharacterId, setTitleByCharacterId, setLanguagesTextByCharacterId, setUnencumberingItemsTextByCharacterId, setOtherNotesTextByCharacterId },
  }
}
