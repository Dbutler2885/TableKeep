import { deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { campaignDocRef, campaignUserStateRef, type CampaignScope } from '../campaign/firestorePaths'
import { sanitizeTokenIconForPersistence } from '../common/mediaStorage'
import { serializeVtmCharacter } from './vtmCharacterRecord'
import type { VtmCharacterRecord } from './vtmTypes'

const CHARACTER_SAVE_DELAY_MS = 500

/** A save waiting out its delay, and how to send it before the delay runs out. */
type WaitingVtmCharacterSave = {
  timer: ReturnType<typeof setTimeout>
  send: () => void
}

/**
 * Saves that have not landed yet, by character id: `pending` holds a save
 * still waiting out its delay, `inFlight` a save sent but not settled.
 */
export type VtmCharacterSaves = {
  pending: Record<string, WaitingVtmCharacterSave>
  inFlight: Record<string, boolean>
}

export const emptyVtmCharacterSaves = (): VtmCharacterSaves => ({ pending: {}, inFlight: {} })

/** The campaign a write goes to, or null while either half of it is missing. */
export const vtmCampaignScope = (campaignId: string | null, groupId: string | null): CampaignScope | null =>
  campaignId && groupId ? { campaignId, groupId } : null

const characterRef = (campaign: CampaignScope, characterId: string) =>
  campaignDocRef(db, campaign, 'characters', characterId)

export function isVtmCharacterSaveOutstanding(saves: VtmCharacterSaves, characterId: string): boolean {
  return Boolean(saves.pending[characterId] || saves.inFlight[characterId])
}

/** Sends every waiting save now, to the campaign it was made in, instead of when its delay runs out. */
export function sendVtmCharacterSavesNow(saves: VtmCharacterSaves) {
  Object.values(saves.pending).forEach(({ timer, send }) => {
    clearTimeout(timer)
    send()
  })
}

/** What a save writes: the serialized record, stamped with the save time. */
export function vtmCharacterSaveFields(character: VtmCharacterRecord) {
  return { ...serializeVtmCharacter(character), updatedAt: serverTimestamp() }
}

export function newVtmCharacterFields(character: VtmCharacterRecord) {
  return {
    system: 'vtm',
    name: character.name,
    ownerUserId: character.ownerUserId,
    ownerUsername: character.ownerUsername ?? null,
    creationMode: character.creationMode,
    creationModeExplicit: character.creationModeExplicit,
    creationStatus: character.creationStatus,
    xp: character.xp,
    portraitPath: '',
    portraitFocusX: 50,
    portraitFocusY: 50,
    tokenIcon: sanitizeTokenIconForPersistence(character.tokenIcon),
    vtm: character.vtm,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

export function createVtmCharacterDoc(campaign: CampaignScope, character: VtmCharacterRecord) {
  return setDoc(characterRef(campaign, character.id), newVtmCharacterFields(character))
}

export function deleteVtmCharacterDoc(campaign: CampaignScope, characterId: string) {
  return deleteDoc(characterRef(campaign, characterId))
}

export function saveCurrentVtmCharacter(campaign: CampaignScope, userId: string, characterId: string) {
  return setDoc(
    campaignUserStateRef(db, campaign, userId),
    { currentCharacterId: characterId, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

function sendVtmCharacterSave(
  saves: VtmCharacterSaves,
  campaign: CampaignScope,
  characterId: string,
  readCharacter: (characterId: string) => VtmCharacterRecord | undefined,
) {
  delete saves.pending[characterId]
  saves.inFlight[characterId] = true
  const character = readCharacter(characterId)
  if (!character) {
    delete saves.inFlight[characterId]
    return
  }
  void setDoc(characterRef(campaign, characterId), vtmCharacterSaveFields(character), { merge: true }).finally(() => {
    delete saves.inFlight[characterId]
  })
}

/**
 * Saves a character half a second after its last edit, reading it when the
 * save comes due so the save carries every edit made in between.
 */
export function scheduleVtmCharacterSave(
  saves: VtmCharacterSaves,
  campaign: CampaignScope,
  characterId: string,
  readCharacter: (characterId: string) => VtmCharacterRecord | undefined,
) {
  const existing = saves.pending[characterId]
  if (existing) clearTimeout(existing.timer)
  const send = () => sendVtmCharacterSave(saves, campaign, characterId, readCharacter)
  saves.pending[characterId] = { timer: setTimeout(send, CHARACTER_SAVE_DELAY_MS), send }
}
