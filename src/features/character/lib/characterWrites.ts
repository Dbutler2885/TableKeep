import { deleteDoc, deleteField, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../../firebase'
import type { CharacterRecord } from '../../../types/app'
import { campaignDocRef, campaignUserStateRef, type CampaignScope } from '../../campaign/firestorePaths'
import { oseCharacterVersioning } from '../../ruleSets/characterMigrations'
import { characterSchemaStamp } from '../../ruleSets/characterSchemaStamp'
import { RETIRED_DETAIL_FIELDS } from '../../ruleSets/ose/characterMigrations'
import { serializeOseCharacter } from './storedCharacterRecord'

const CHARACTER_SAVE_DELAY_MS = 500

/** A save waiting out its delay, and how to send it before the delay runs out. */
type WaitingCharacterSave = {
  timer: ReturnType<typeof setTimeout>
  send: () => void
}

/**
 * Saves that have not landed yet, by character id: `pending` holds a save
 * still waiting out its delay, `inFlight` a save sent but not settled.
 */
export type CharacterSaves = {
  pending: Record<string, WaitingCharacterSave>
  inFlight: Record<string, boolean>
}

export const emptyCharacterSaves = (): CharacterSaves => ({ pending: {}, inFlight: {} })

/** The campaign a write goes to, or null while either half of it is missing. */
export const campaignScope = (campaignId: string | null, groupId: string | null): CampaignScope | null =>
  campaignId && groupId ? { campaignId, groupId } : null

const characterRef = (campaign: CampaignScope, characterId: string) =>
  campaignDocRef(db, campaign, 'characters', characterId)

export function isCharacterSaveOutstanding(saves: CharacterSaves, characterId: string): boolean {
  return !!saves.pending[characterId] || !!saves.inFlight[characterId]
}

/** Sends every waiting save now, to the campaign it was made in, instead of when its delay runs out. */
export function sendCharacterSavesNow(saves: CharacterSaves) {
  Object.values(saves.pending).forEach(({ timer, send }) => {
    clearTimeout(timer)
    send()
  })
}

/** Drops one character's waiting save without sending it, and forgets its save in flight. */
export function cancelCharacterSave(saves: CharacterSaves, characterId: string) {
  const pending = saves.pending[characterId]
  if (pending) {
    clearTimeout(pending.timer)
    delete saves.pending[characterId]
  }
  delete saves.inFlight[characterId]
}

/**
 * What a save writes: the serialized record, stamped with the current version
 * and the save time. A merge keeps fields it does not mention, so the save
 * deletes the detail fields OSE's step removes, or an old character's lists
 * would stay stored under the new version.
 */
export function characterSaveFields(character: CharacterRecord): Record<string, unknown> {
  const fields = serializeOseCharacter(character)
  const details = fields.details as Record<string, unknown> | null
  return {
    ...fields,
    details: details && { ...details, ...Object.fromEntries(RETIRED_DETAIL_FIELDS.map((name) => [name, deleteField()])) },
    ...characterSchemaStamp(oseCharacterVersioning),
    updatedAt: serverTimestamp(),
  }
}

export function deleteCharacterDoc(campaign: CampaignScope, characterId: string) {
  return deleteDoc(characterRef(campaign, characterId))
}

export function saveCurrentCharacter(campaign: CampaignScope, userId: string, characterId: string) {
  return setDoc(
    campaignUserStateRef(db, campaign, userId),
    { currentCharacterId: characterId, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

function sendCharacterSave(
  saves: CharacterSaves,
  campaign: CampaignScope,
  characterId: string,
  readCharacter: (characterId: string) => CharacterRecord | undefined,
) {
  delete saves.pending[characterId]
  saves.inFlight[characterId] = true
  const character = readCharacter(characterId)
  if (!character) {
    delete saves.inFlight[characterId]
    return
  }
  void setDoc(characterRef(campaign, characterId), characterSaveFields(character), { merge: true }).finally(() => {
    delete saves.inFlight[characterId]
  })
}

/**
 * Saves a character half a second after its last edit, reading it when the
 * save comes due so the save carries every edit made in between.
 */
export function scheduleCharacterSave(
  saves: CharacterSaves,
  campaign: CampaignScope,
  characterId: string,
  readCharacter: (characterId: string) => CharacterRecord | undefined,
) {
  const existing = saves.pending[characterId]
  if (existing) clearTimeout(existing.timer)
  const send = () => sendCharacterSave(saves, campaign, characterId, readCharacter)
  saves.pending[characterId] = { timer: setTimeout(send, CHARACTER_SAVE_DELAY_MS), send }
}
