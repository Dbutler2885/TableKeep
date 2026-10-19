// The decisions behind the sheet's seed/reseed/persist effect chain.
// Each takes the refs the chain shares, so useCharacterPersistenceSync only orders the effects.

import type { RefObject } from 'react'
import type { CharacterInventoryItem, CharacterRecord, CharacterSheetDetails } from '../../../types/app'
import { stableStringify } from '../characterFactories'
import { incomingInventoryFromDetails, seedInventoryFromDetails } from '../inventoryHydration'
import { shouldAdoptIncomingInventory } from '../inventorySync'
import {
  detailsFromState,
  reseedSheetFields,
  seedCombatFields,
  seedNoteFields,
  seedScoreFields,
  seedStoreAndSpellFields,
  type StateMaps,
  type StateSetters,
} from './characterSheetFields'

export type PersistenceSyncRefs = {
  seededCharacterIdsRef: RefObject<Set<string>>
  justSeededRef: RefObject<Set<string>>
  lastPersistedDetailsJsonRef: RefObject<Record<string, string>>
  lastPersistedInventoryJsonRef: RefObject<Record<string, string>>
  locallyDirtyCharacterIdsRef: RefObject<Set<string>>
  locallyDirtyInventoryCharacterIdsRef: RefObject<Set<string>>
}

export type StoreSync = {
  hasPendingWrite: (id: string) => boolean
  migrateToInventory: (details: CharacterSheetDetails) => CharacterInventoryItem[]
  setters: StateSetters
  refs: PersistenceSyncRefs
}

/** Whether a character has been seeded and the render that seeded it has passed. */
const isSettledSeed = (characterId: string, refs: PersistenceSyncRefs) =>
  !!characterId && refs.seededCharacterIdsRef.current.has(characterId) && !refs.justSeededRef.current.has(characterId)

function setMembership(ids: Set<string>, id: string, isMember: boolean) {
  if (isMember) ids.add(id)
  else ids.delete(id)
}

/** Marks the open character's sheet as locally edited while it differs from what was last stored. */
export function markLocalDetailsDirty(selectedCharacterId: string, stateMaps: StateMaps, refs: PersistenceSyncRefs) {
  if (!isSettledSeed(selectedCharacterId, refs)) return
  const localJson = stableStringify(detailsFromState(stateMaps, selectedCharacterId))
  const isDirty = localJson !== refs.lastPersistedDetailsJsonRef.current[selectedCharacterId]
  setMembership(refs.locallyDirtyCharacterIdsRef.current, selectedCharacterId, isDirty)
}

/** Marks each seeded character's items as locally edited while they differ from what was last stored. */
export function markLocalInventoriesDirty(
  characters: CharacterRecord[],
  inventoryByCharacterId: StateMaps['inventoryByCharacterId'],
  refs: PersistenceSyncRefs,
) {
  for (const { id } of characters) {
    if (!refs.seededCharacterIdsRef.current.has(id)) continue
    const localInventoryJson = stableStringify(inventoryByCharacterId[id] ?? [])
    const isDirty = localInventoryJson !== refs.lastPersistedInventoryJsonRef.current[id]
    setMembership(refs.locallyDirtyInventoryCharacterIdsRef.current, id, isDirty)
  }
}

function seedInventory(id: string, className: string, details: CharacterSheetDetails, { migrateToInventory, setters, refs }: StoreSync) {
  const { inventory, persistedInventoryJson, isLocallyDirty } = seedInventoryFromDetails(className, details, migrateToInventory)
  refs.lastPersistedInventoryJsonRef.current[id] = persistedInventoryJson
  setMembership(refs.locallyDirtyInventoryCharacterIdsRef.current, id, isLocallyDirty)
  setters.setInventoryByCharacterId((prev) => ({ ...prev, [id]: inventory }))
}

function seedSheet(id: string, className: string, details: CharacterSheetDetails, sync: StoreSync) {
  seedScoreFields(id, details, sync.setters)
  seedInventory(id, className, details, sync)
  seedCombatFields(id, details, sync.setters)
  seedStoreAndSpellFields(id, details, sync.setters)
  seedNoteFields(id, details, sync.setters)
}

function seedCharacter({ id, className, details }: CharacterRecord, sync: StoreSync) {
  const { refs } = sync
  refs.seededCharacterIdsRef.current.add(id)
  refs.justSeededRef.current.add(id)
  if (details) {
    seedSheet(id, className, details, sync)
  } else {
    refs.lastPersistedInventoryJsonRef.current[id] = stableStringify([])
    refs.locallyDirtyInventoryCharacterIdsRef.current.delete(id)
  }
  refs.lastPersistedDetailsJsonRef.current[id] = stableStringify(details ?? null)
}

function adoptIncomingInventory({ id, details }: CharacterRecord, { hasPendingWrite, migrateToInventory, setters, refs }: StoreSync) {
  if (hasPendingWrite(id) || !details) return
  const incomingInventory = incomingInventoryFromDetails(details, migrateToInventory)
  const inventoryDecision = shouldAdoptIncomingInventory({
    hasPendingWrite: hasPendingWrite(id),
    isLocallyDirtyInventory: refs.locallyDirtyInventoryCharacterIdsRef.current.has(id),
    incomingInventory,
    lastPersistedInventoryJson: refs.lastPersistedInventoryJsonRef.current[id],
  })
  if (!inventoryDecision.shouldAdopt) return
  refs.lastPersistedInventoryJsonRef.current[id] = inventoryDecision.incomingInventoryJson
  setters.setInventoryByCharacterId((prev) => ({ ...prev, [id]: incomingInventory }))
}

// Re-seed from Firestore if another user edited (no pending local write)
function reseedIncomingDetails({ id, details }: CharacterRecord, { hasPendingWrite, setters, refs }: StoreSync) {
  if (hasPendingWrite(id) || refs.locallyDirtyCharacterIdsRef.current.has(id) || !details) return
  const incomingJson = stableStringify(details)
  if (incomingJson === refs.lastPersistedDetailsJsonRef.current[id]) return
  refs.lastPersistedDetailsJsonRef.current[id] = incomingJson
  reseedSheetFields(id, details, setters)
}

function syncCharacterFromStore(character: CharacterRecord, sync: StoreSync) {
  if (!sync.refs.seededCharacterIdsRef.current.has(character.id)) {
    seedCharacter(character, sync)
    return
  }
  adoptIncomingInventory(character, sync)
  reseedIncomingDetails(character, sync)
}

/** Seeds each character the first time it loads, and takes in another person's edit to one already seeded. */
export function syncCharactersFromStore(characters: CharacterRecord[], sync: StoreSync) {
  for (const character of characters) syncCharacterFromStore(character, sync)
}

/** Writes the open character's sheet when it differs from what was last stored. */
export function persistSelectedDetails(
  selectedCharacterId: string,
  stateMaps: StateMaps,
  refs: PersistenceSyncRefs,
  updateCharacter: (characterId: string, updates: Partial<CharacterRecord>) => void,
) {
  // Skip the render immediately after seeding - state updates haven't been processed yet
  if (!isSettledSeed(selectedCharacterId, refs)) return
  const details = detailsFromState(stateMaps, selectedCharacterId)
  const json = stableStringify(details)
  if (json === refs.lastPersistedDetailsJsonRef.current[selectedCharacterId]) return
  refs.lastPersistedDetailsJsonRef.current[selectedCharacterId] = json
  refs.locallyDirtyCharacterIdsRef.current.delete(selectedCharacterId)
  updateCharacter(selectedCharacterId, { details })
}
