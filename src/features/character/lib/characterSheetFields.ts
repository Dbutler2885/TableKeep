// The sheet's local state is one map per field, keyed by character id.
// These read a character's sheet details out of those maps, and write stored
// details into them: a first seed takes only the fields that are set, and a
// re-seed replaces some fields and keeps the earlier value of others.

import type { Dispatch, SetStateAction } from 'react'
import type {
  CharacterInventoryItem,
  CharacterSheetDetails,
  CharacterStoreCartEntry as StoreCartEntry,
} from '../../../types/app'
import type { AbilityScores, AdventureScores, SaveScores, ThiefSkillScores } from '../characterRules'
import { emptyAbilityScores } from '../characterRules'

type Setter<T> = Dispatch<SetStateAction<T>>

export type StateMaps = {
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

export type StateSetters = {
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

const scoreDetailsFromState = (stateMaps: StateMaps, characterId: string) => ({
  abilityScores: stateMaps.abilityScoresByCharacterId[characterId] ?? emptyAbilityScores(),
  rolledAbilityScores: stateMaps.rolledAbilityScoresByCharacterId[characterId] ?? null,
  abilityScoresRolled: !!stateMaps.abilityScoresRolledByCharacterId[characterId],
  hpBaseRoll: stateMaps.hpBaseRollByCharacterId[characterId] ?? null,
})

const combatDetailsFromState = (stateMaps: StateMaps, characterId: string) => ({
  thaco: stateMaps.thacoByCharacterId[characterId] ?? '',
  saveScores: stateMaps.saveScoresByCharacterId[characterId] ?? null,
  adventureScores: stateMaps.adventureScoresByCharacterId[characterId] ?? null,
  adventureSeedClass: stateMaps.adventureSeedClassByCharacterId[characterId] ?? '',
  thiefSkills: stateMaps.thiefSkillsByCharacterId[characterId] ?? null,
})

const storeAndSpellDetailsFromState = (stateMaps: StateMaps, characterId: string) => ({
  startingGold: stateMaps.startingGoldByCharacterId[characterId] ?? null,
  storeSpent: stateMaps.storeSpentByCharacterId[characterId] ?? 0,
  storeCart: stateMaps.storeCartByCharacterId[characterId] ?? [],
  spellBookSpellIds: stateMaps.spellBookSpellIdsByCharacterId[characterId] ?? [],
  memorizedSpellIds: stateMaps.memorizedSpellIdsByCharacterId[characterId] ?? [],
})

const noteDetailsFromState = (stateMaps: StateMaps, characterId: string) => ({
  alignment: stateMaps.alignmentByCharacterId[characterId] ?? 'Neutrality',
  title: stateMaps.titleByCharacterId[characterId] ?? '',
  languagesText: stateMaps.languagesTextByCharacterId[characterId] ?? '',
  unencumberingItemsText: stateMaps.unencumberingItemsTextByCharacterId[characterId] ?? '',
  otherNotesText: stateMaps.otherNotesTextByCharacterId[characterId] ?? '',
})

/** The sheet details a character's local state holds, with a default for each field it does not. */
export const detailsFromState = (stateMaps: StateMaps, characterId: string): CharacterSheetDetails => ({
  ...scoreDetailsFromState(stateMaps, characterId),
  inventory: stateMaps.inventoryByCharacterId[characterId] ?? [],
  ...combatDetailsFromState(stateMaps, characterId),
  ...storeAndSpellDetailsFromState(stateMaps, characterId),
  ...noteDetailsFromState(stateMaps, characterId),
})

// A first seed takes each field only when it is set.

export function seedScoreFields(id: string, details: CharacterSheetDetails, setters: StateSetters) {
  if (details.abilityScores) setters.setAbilityScoresByCharacterId((prev) => ({ ...prev, [id]: details.abilityScores as AbilityScores }))
  if (details.rolledAbilityScores) setters.setRolledAbilityScoresByCharacterId((prev) => ({ ...prev, [id]: details.rolledAbilityScores as AbilityScores }))
  if (details.abilityScoresRolled) setters.setAbilityScoresRolledByCharacterId((prev) => ({ ...prev, [id]: true }))
  if (typeof details.hpBaseRoll === 'number') setters.setHpBaseRollByCharacterId((prev) => ({ ...prev, [id]: details.hpBaseRoll as number }))
}

export function seedCombatFields(id: string, details: CharacterSheetDetails, setters: StateSetters) {
  if (details.thaco) setters.setThacoByCharacterId((prev) => ({ ...prev, [id]: details.thaco as string }))
  if (details.saveScores) setters.setSaveScoresByCharacterId((prev) => ({ ...prev, [id]: details.saveScores as SaveScores }))
  if (details.adventureScores) setters.setAdventureScoresByCharacterId((prev) => ({ ...prev, [id]: details.adventureScores as AdventureScores }))
  if (details.adventureSeedClass) setters.setAdventureSeedClassByCharacterId((prev) => ({ ...prev, [id]: details.adventureSeedClass as string }))
  if (details.thiefSkills) setters.setThiefSkillsByCharacterId((prev) => ({ ...prev, [id]: details.thiefSkills as ThiefSkillScores }))
}

export function seedStoreAndSpellFields(id: string, details: CharacterSheetDetails, setters: StateSetters) {
  if (typeof details.startingGold === 'number') setters.setStartingGoldByCharacterId((prev) => ({ ...prev, [id]: details.startingGold as number }))
  if (typeof details.storeSpent === 'number') setters.setStoreSpentByCharacterId((prev) => ({ ...prev, [id]: details.storeSpent as number }))
  if (details.storeCart) setters.setStoreCartByCharacterId((prev) => ({ ...prev, [id]: details.storeCart as StoreCartEntry[] }))
  if (details.spellBookSpellIds) setters.setSpellBookSpellIdsByCharacterId((prev) => ({ ...prev, [id]: details.spellBookSpellIds as string[] }))
  if (details.memorizedSpellIds) setters.setMemorizedSpellIdsByCharacterId((prev) => ({ ...prev, [id]: details.memorizedSpellIds as string[] }))
}

export function seedNoteFields(id: string, details: CharacterSheetDetails, setters: StateSetters) {
  if (details.alignment) setters.setAlignmentByCharacterId((prev) => ({ ...prev, [id]: details.alignment as string }))
  if (details.title) setters.setTitleByCharacterId((prev) => ({ ...prev, [id]: details.title as string }))
  if (typeof details.languagesText === 'string') setters.setLanguagesTextByCharacterId((prev) => ({ ...prev, [id]: details.languagesText as string }))
  if (typeof details.unencumberingItemsText === 'string') setters.setUnencumberingItemsTextByCharacterId((prev) => ({ ...prev, [id]: details.unencumberingItemsText as string }))
  if (typeof details.otherNotesText === 'string') setters.setOtherNotesTextByCharacterId((prev) => ({ ...prev, [id]: details.otherNotesText as string }))
}

// A re-seed replaces some fields outright and keeps the earlier value of others when the incoming one is unset.

function reseedScoreFields(id: string, details: CharacterSheetDetails, setters: StateSetters) {
  setters.setAbilityScoresByCharacterId((prev) => ({ ...prev, [id]: (details.abilityScores as AbilityScores) ?? emptyAbilityScores() }))
  setters.setRolledAbilityScoresByCharacterId((prev) => details.rolledAbilityScores ? { ...prev, [id]: details.rolledAbilityScores as AbilityScores } : prev)
  setters.setAbilityScoresRolledByCharacterId((prev) => ({ ...prev, [id]: !!details.abilityScoresRolled }))
  setters.setHpBaseRollByCharacterId((prev) => typeof details.hpBaseRoll === 'number' ? { ...prev, [id]: details.hpBaseRoll } : prev)
}

function reseedCombatFields(id: string, details: CharacterSheetDetails, setters: StateSetters) {
  setters.setThacoByCharacterId((prev) => ({ ...prev, [id]: (details.thaco as string) ?? '' }))
  setters.setSaveScoresByCharacterId((prev) => details.saveScores ? { ...prev, [id]: details.saveScores as SaveScores } : prev)
  setters.setAdventureScoresByCharacterId((prev) => details.adventureScores ? { ...prev, [id]: details.adventureScores as AdventureScores } : prev)
  setters.setAdventureSeedClassByCharacterId((prev) => details.adventureSeedClass ? { ...prev, [id]: details.adventureSeedClass } : prev)
  setters.setThiefSkillsByCharacterId((prev) => details.thiefSkills ? { ...prev, [id]: details.thiefSkills as ThiefSkillScores } : prev)
}

function reseedStoreAndSpellFields(id: string, details: CharacterSheetDetails, setters: StateSetters) {
  setters.setStartingGoldByCharacterId((prev) => typeof details.startingGold === 'number' ? { ...prev, [id]: details.startingGold } : prev)
  setters.setStoreSpentByCharacterId((prev) => typeof details.storeSpent === 'number' ? { ...prev, [id]: details.storeSpent } : prev)
  setters.setStoreCartByCharacterId((prev) => details.storeCart ? { ...prev, [id]: details.storeCart as StoreCartEntry[] } : prev)
  setters.setSpellBookSpellIdsByCharacterId((prev) => ({ ...prev, [id]: (details.spellBookSpellIds as string[]) ?? [] }))
  setters.setMemorizedSpellIdsByCharacterId((prev) => ({ ...prev, [id]: (details.memorizedSpellIds as string[]) ?? [] }))
}

function reseedNoteFields(id: string, details: CharacterSheetDetails, setters: StateSetters) {
  setters.setAlignmentByCharacterId((prev) => details.alignment ? { ...prev, [id]: details.alignment } : prev)
  setters.setTitleByCharacterId((prev) => details.title ? { ...prev, [id]: details.title } : prev)
  setters.setLanguagesTextByCharacterId((prev) => ({ ...prev, [id]: typeof details.languagesText === 'string' ? details.languagesText : '' }))
  setters.setUnencumberingItemsTextByCharacterId((prev) => ({ ...prev, [id]: typeof details.unencumberingItemsText === 'string' ? details.unencumberingItemsText : '' }))
  setters.setOtherNotesTextByCharacterId((prev) => ({ ...prev, [id]: typeof details.otherNotesText === 'string' ? details.otherNotesText : '' }))
}

/** Writes every field but the items of an incoming sheet into the local state. */
export function reseedSheetFields(id: string, details: CharacterSheetDetails, setters: StateSetters) {
  reseedScoreFields(id, details, setters)
  reseedCombatFields(id, details, setters)
  reseedStoreAndSpellFields(id, details, setters)
  reseedNoteFields(id, details, setters)
}
