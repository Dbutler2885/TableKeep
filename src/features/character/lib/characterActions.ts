import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { CharacterRecord, Role } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { findCharacter, selectionAfterDelete } from './characterSnapshot'
import {
  cancelCharacterSave,
  deleteCharacterDoc,
  saveCurrentCharacter,
  scheduleCharacterSave,
  type CharacterSaves,
} from './characterWrites'

/** Everything the character actions read and change, as of the render that made them. */
export type CharacterActionContext = {
  campaign: CampaignScope | null
  role: Role | null
  userId: string
  selectedCharacterId: string
  charactersRef: RefObject<CharacterRecord[]>
  savesRef: RefObject<CharacterSaves>
  setCharacters: Dispatch<SetStateAction<CharacterRecord[]>>
  setSelectedCharacterId: Dispatch<SetStateAction<string>>
  setCurrentCharacterId: Dispatch<SetStateAction<string | null>>
}

/** The GM may edit or delete any character; a player only their own. */
export const canEditCharacter = (target: CharacterRecord | undefined, role: Role | null, userId: string) =>
  target !== undefined && (role === 'gm' || target.ownerUserId === userId)

/** A player may only make their own character current. */
export const canChooseCharacter = (target: CharacterRecord | undefined, role: Role | null, userId: string) =>
  target !== undefined && (role !== 'player' || target.ownerUserId === userId)

const withUpdates = (characters: CharacterRecord[], characterId: string, updates: Partial<CharacterRecord>) =>
  characters.map((character) => (character.id === characterId ? { ...character, ...updates } : character))

/** The updates with the max hit points at least zero and the current between zero and the new or stored max. */
export function clampHitPointUpdates(target: CharacterRecord, updates: Partial<CharacterRecord>): Partial<CharacterRecord> {
  const nextUpdates = { ...updates }
  const nextHpMax = Math.max(0, typeof nextUpdates.hpMax === 'number' ? nextUpdates.hpMax : target.hpMax)
  if (typeof nextUpdates.hpMax === 'number') {
    nextUpdates.hpMax = nextHpMax
  }
  if (typeof nextUpdates.hpCurrent === 'number') {
    nextUpdates.hpCurrent = Math.max(0, Math.min(nextUpdates.hpCurrent, nextHpMax))
  }
  return nextUpdates
}

export function updateCharacter(context: CharacterActionContext, characterId: string, updates: Partial<CharacterRecord>) {
  const { charactersRef } = context
  const target = findCharacter(charactersRef.current, characterId)
  if (!target || !canEditCharacter(target, context.role, context.userId)) return
  const next = withUpdates(charactersRef.current, characterId, clampHitPointUpdates(target, updates))
  charactersRef.current = next
  context.setCharacters(next)
  if (!context.campaign) return
  scheduleCharacterSave(context.savesRef.current, context.campaign, characterId, (id) => findCharacter(charactersRef.current, id))
}

/** Changes the local copy only, with no permission check and no save. */
export function syncCharacterLocal(context: CharacterActionContext, characterId: string, updates: Partial<CharacterRecord>) {
  context.setCharacters((current) => withUpdates(current, characterId, updates))
}

export function deleteCharacter(context: CharacterActionContext, characterId: string) {
  const { campaign } = context
  if (!campaign) return
  const target = findCharacter(context.charactersRef.current, characterId)
  if (!canEditCharacter(target, context.role, context.userId)) return
  cancelCharacterSave(context.savesRef.current, characterId)
  context.setCharacters((current) => {
    const next = current.filter((character) => character.id !== characterId)
    const selection = selectionAfterDelete(next, context.selectedCharacterId, characterId)
    if (selection !== null) context.setSelectedCharacterId(selection)
    return next
  })
  void deleteCharacterDoc(campaign, characterId)
}

export async function chooseCurrentCharacter(context: CharacterActionContext, characterId: string) {
  const { campaign } = context
  if (!campaign || !context.role) return
  const target = findCharacter(context.charactersRef.current, characterId)
  if (!canChooseCharacter(target, context.role, context.userId)) return
  context.setCurrentCharacterId(characterId)
  await saveCurrentCharacter(campaign, context.userId, characterId)
}
