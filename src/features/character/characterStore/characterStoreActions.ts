import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { Role } from '../../../types/app'
import type { CharacterStoreRecord, CharacterStoreRuleSet } from './characterStoreRecord'
import { findCharacterStoreCharacter } from './characterStoreRoster'
import {
  cancelCharacterStoreSave,
  createCharacterStoreDoc,
  deleteCharacterStoreDoc,
  saveCharacterStoreCurrentCharacter,
  scheduleCharacterStoreSave,
  sendCharacterStoreSaveNow,
  type CharacterStoreSaves,
  type CharacterStoreScope,
} from './characterStoreWrites'

/** Everything the character actions read and change, as of the render that made them. */
export type CharacterStoreActionContext<Character extends CharacterStoreRecord> = {
  ruleSet: CharacterStoreRuleSet<Character>
  campaign: CharacterStoreScope | null
  role: Role | null
  userId: string
  charactersRef: RefObject<Character[]>
  savesRef: RefObject<CharacterStoreSaves>
  setCharacters: Dispatch<SetStateAction<Character[]>>
  setSelectedCharacterId: Dispatch<SetStateAction<string>>
  setCurrentCharacterId: Dispatch<SetStateAction<string | null>>
}

/** The GM may edit any character; a player only their own. */
export const canEditCharacterStoreCharacter = (target: CharacterStoreRecord | undefined, role: Role | null, userId: string) =>
  target !== undefined && (role === 'gm' || target.ownerUserId === userId)

/** A player may only make their own character current. */
export const canChooseCharacterStoreCharacter = (target: CharacterStoreRecord | undefined, role: Role | null, userId: string) =>
  target !== undefined && (role !== 'player' || target.ownerUserId === userId)

const withCharacterStoreUpdates = <Character extends CharacterStoreRecord>(
  characters: Character[],
  characterId: string,
  updates: Partial<Character>,
) => characters.map((character) => (character.id === characterId ? { ...character, ...updates } : character))

// Applies an edit locally when the viewer may make it; true when it was applied.
function applyCharacterStoreUpdate<Character extends CharacterStoreRecord>(
  context: CharacterStoreActionContext<Character>,
  characterId: string,
  updates: Partial<Character>,
): boolean {
  const { charactersRef, ruleSet } = context
  const target = findCharacterStoreCharacter(charactersRef.current, characterId)
  if (!target || !canEditCharacterStoreCharacter(target, context.role, context.userId)) return false
  const next = withCharacterStoreUpdates(charactersRef.current, characterId,
    ruleSet.adjustUpdates ? ruleSet.adjustUpdates(target, updates) : updates)
  charactersRef.current = next
  context.setCharacters(next)
  return true
}

const readCharacterStoreCharacter = <Character extends CharacterStoreRecord>(context: CharacterStoreActionContext<Character>) =>
  (id: string) => findCharacterStoreCharacter(context.charactersRef.current, id)

/** Applies an edit and saves it half a second after the character's last edit. */
export function updateCharacterStoreCharacter<Character extends CharacterStoreRecord>(
  context: CharacterStoreActionContext<Character>,
  characterId: string,
  updates: Partial<Character>,
) {
  if (!applyCharacterStoreUpdate(context, characterId, updates) || !context.campaign) return
  scheduleCharacterStoreSave(context.savesRef.current, context.campaign, context.ruleSet, characterId,
    readCharacterStoreCharacter(context))
}

/**
 * Applies an edit and saves the character at once, instead of after the delay,
 * so the save also carries any edit still waiting out its delay.
 */
export function updateCharacterStoreCharacterNow<Character extends CharacterStoreRecord>(
  context: CharacterStoreActionContext<Character>,
  characterId: string,
  updates: Partial<Character>,
) {
  if (!applyCharacterStoreUpdate(context, characterId, updates) || !context.campaign) return
  sendCharacterStoreSaveNow(context.savesRef.current, context.campaign, context.ruleSet, characterId,
    readCharacterStoreCharacter(context))
}

/** Changes the local copy only, with no permission check and no save. */
export function syncCharacterStoreCharacterLocal<Character extends CharacterStoreRecord>(
  context: CharacterStoreActionContext<Character>,
  characterId: string,
  updates: Partial<Character>,
) {
  context.setCharacters((current) => withCharacterStoreUpdates(current, characterId, updates))
}

/** Adds, selects and creates a character the caller has made, under the id it already carries. */
export async function addCharacterStoreCharacter<Character extends CharacterStoreRecord>(
  context: CharacterStoreActionContext<Character>,
  character: Character,
) {
  const { campaign } = context
  if (!campaign || !context.role) return
  context.setSelectedCharacterId(character.id)
  context.setCharacters((current) => [...current, character])
  await createCharacterStoreDoc(campaign, context.ruleSet, character)
}

/** Deletes a character's stored record; the store's own deletes the document only. */
export type CharacterStoreRemove = (campaign: CharacterStoreScope, characterId: string) => Promise<void>

/**
 * Removes the character and deletes its document, dropping any save of it
 * that has not landed. `remove` replaces the document delete for a rule set
 * that keeps more with a character. True when it was deleted.
 */
export function deleteCharacterStoreCharacter<Character extends CharacterStoreRecord>(
  context: CharacterStoreActionContext<Character>,
  characterId: string,
  remove: CharacterStoreRemove = deleteCharacterStoreDoc,
): boolean {
  if (!context.campaign) return false
  const target = findCharacterStoreCharacter(context.charactersRef.current, characterId)
  if (!canEditCharacterStoreCharacter(target, context.role, context.userId)) return false
  cancelCharacterStoreSave(context.savesRef.current, characterId)
  context.setCharacters((current) => current.filter((character) => character.id !== characterId))
  void remove(context.campaign, characterId)
  return true
}

export async function chooseCharacterStoreCurrentCharacter<Character extends CharacterStoreRecord>(
  context: CharacterStoreActionContext<Character>,
  characterId: string,
) {
  const { campaign } = context
  if (!campaign || !context.role) return
  const target = findCharacterStoreCharacter(context.charactersRef.current, characterId)
  if (!canChooseCharacterStoreCharacter(target, context.role, context.userId)) return
  context.setCurrentCharacterId(characterId)
  await saveCharacterStoreCurrentCharacter(campaign, context.userId, characterId)
}
