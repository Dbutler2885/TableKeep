import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { Role } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import type { CharacterStoreRecord, CharacterStoreRuleSet } from './characterStoreRecord'
import { findCharacterStoreCharacter } from './characterStoreRoster'
import {
  createCharacterStoreDoc,
  deleteCharacterStoreDoc,
  saveCharacterStoreCurrentCharacter,
  scheduleCharacterStoreSave,
  type CharacterStoreSaves,
} from './characterStoreWrites'

/** Everything the character actions read and change, as of the render that made them. */
export type CharacterStoreActionContext<Character extends CharacterStoreRecord> = {
  ruleSet: CharacterStoreRuleSet<Character>
  campaign: CampaignScope | null
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

export function updateCharacterStoreCharacter<Character extends CharacterStoreRecord>(
  context: CharacterStoreActionContext<Character>,
  characterId: string,
  updates: Partial<Character>,
) {
  const { charactersRef } = context
  if (!canEditCharacterStoreCharacter(findCharacterStoreCharacter(charactersRef.current, characterId), context.role, context.userId)) return
  const next = charactersRef.current.map((character) =>
    character.id === characterId ? { ...character, ...updates } : character,
  )
  charactersRef.current = next
  context.setCharacters(next)
  if (!context.campaign) return
  scheduleCharacterStoreSave(context.savesRef.current, context.campaign, context.ruleSet, characterId,
    (id) => findCharacterStoreCharacter(charactersRef.current, id))
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

export function deleteCharacterStoreCharacter<Character extends CharacterStoreRecord>(
  context: CharacterStoreActionContext<Character>,
  characterId: string,
) {
  if (!context.campaign) return
  const target = findCharacterStoreCharacter(context.charactersRef.current, characterId)
  if (!canEditCharacterStoreCharacter(target, context.role, context.userId)) return
  context.setCharacters((current) => current.filter((character) => character.id !== characterId))
  void deleteCharacterStoreDoc(context.campaign, characterId)
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
