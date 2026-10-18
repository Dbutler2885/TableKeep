import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { Role } from '../../types/app'
import type { CampaignScope } from '../campaign/firestorePaths'
import { findVtmCharacter } from './vtmCharacterRoster'
import {
  createVtmCharacterDoc,
  deleteVtmCharacterDoc,
  saveCurrentVtmCharacter,
  scheduleVtmCharacterSave,
  type VtmCharacterSaves,
} from './vtmCharacterWrites'
import { makeVtmCharacter } from './vtmDefaults'
import type { VtmCharacterRecord } from './vtmTypes'

/** Everything the character actions read and change, as of the render that made them. */
export type VtmCharacterActionContext = {
  campaign: CampaignScope | null
  role: Role | null
  userId: string
  currentUsername: string
  charactersRef: RefObject<VtmCharacterRecord[]>
  savesRef: RefObject<VtmCharacterSaves>
  setCharacters: Dispatch<SetStateAction<VtmCharacterRecord[]>>
  setSelectedCharacterId: Dispatch<SetStateAction<string>>
  setCurrentCharacterId: Dispatch<SetStateAction<string | null>>
}

/** The GM may edit any character; a player only their own. */
export const canEditVtmCharacter = (target: VtmCharacterRecord | undefined, role: Role | null, userId: string) =>
  target !== undefined && (role === 'gm' || target.ownerUserId === userId)

/** A player may only make their own character current. */
export const canChooseVtmCharacter = (target: VtmCharacterRecord | undefined, role: Role | null, userId: string) =>
  target !== undefined && (role !== 'player' || target.ownerUserId === userId)

export function updateVtmCharacter(
  context: VtmCharacterActionContext,
  characterId: string,
  updates: Partial<VtmCharacterRecord>,
) {
  const { charactersRef } = context
  if (!canEditVtmCharacter(findVtmCharacter(charactersRef.current, characterId), context.role, context.userId)) return
  const next = charactersRef.current.map((character) =>
    character.id === characterId ? { ...character, ...updates } : character,
  )
  charactersRef.current = next
  context.setCharacters(next)
  if (!context.campaign) return
  scheduleVtmCharacterSave(context.savesRef.current, context.campaign, characterId, (id) => findVtmCharacter(charactersRef.current, id))
}

export async function addVtmCharacter(context: VtmCharacterActionContext, creationMode: 'new' | 'established') {
  const { campaign } = context
  if (!campaign || !context.role) return
  // Players may own multiple characters; creation is no longer capped per user.
  const character = makeVtmCharacter(context.userId, context.currentUsername, creationMode)
  context.setSelectedCharacterId(character.id)
  context.setCharacters((current) => [...current, character])
  await createVtmCharacterDoc(campaign, character)
}

export function deleteVtmCharacter(context: VtmCharacterActionContext, characterId: string) {
  if (!context.campaign) return
  const target = findVtmCharacter(context.charactersRef.current, characterId)
  if (!canEditVtmCharacter(target, context.role, context.userId)) return
  context.setCharacters((current) => current.filter((character) => character.id !== characterId))
  void deleteVtmCharacterDoc(context.campaign, characterId)
}

export async function chooseCurrentVtmCharacter(context: VtmCharacterActionContext, characterId: string) {
  const { campaign } = context
  if (!campaign || !context.role) return
  const target = findVtmCharacter(context.charactersRef.current, characterId)
  if (!canChooseVtmCharacter(target, context.role, context.userId)) return
  context.setCurrentCharacterId(characterId)
  await saveCurrentVtmCharacter(campaign, context.userId, characterId)
}
