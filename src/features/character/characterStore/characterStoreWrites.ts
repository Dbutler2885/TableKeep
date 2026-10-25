import { deleteDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../../../firebase'
import { campaignDocRef, campaignUserStateRef, type CampaignScope } from '../../campaign/firestorePaths'
import { characterSchemaStamp } from '../../ruleSets/characterSchemaStamp'
import type { CharacterStoreRecord, CharacterStoreRuleSet } from './characterStoreRecord'

const CHARACTER_SAVE_DELAY_MS = 500

/** A save waiting out its delay, and how to send it before the delay runs out. */
type WaitingCharacterStoreSave = {
  timer: ReturnType<typeof setTimeout>
  send: () => void
}

/**
 * Saves that have not landed yet, by character id: `pending` holds a save
 * still waiting out its delay, `inFlight` a save sent but not settled.
 */
export type CharacterStoreSaves = {
  pending: Record<string, WaitingCharacterStoreSave>
  inFlight: Record<string, boolean>
}

export const emptyCharacterStoreSaves = (): CharacterStoreSaves => ({ pending: {}, inFlight: {} })

/** The campaign collections a store keeps its records in: the characters, or the GM's NPC sheets. */
export type CharacterStoreCollection = 'characters' | 'npcSheets'

/** The campaign a store writes to, and the collection there, which is the characters unless named. */
export type CharacterStoreScope = CampaignScope & { collection?: CharacterStoreCollection }

/** The campaign a write goes to, or null while either half of it is missing. */
export const characterStoreCampaign = (campaignId: string | null, groupId: string | null): CampaignScope | null =>
  campaignId && groupId ? { campaignId, groupId } : null

/** Where a store's writes go, or null while either half of the campaign is missing. */
export function characterStoreScope(campaignId: string | null, groupId: string | null, collection: CharacterStoreCollection): CharacterStoreScope | null {
  const campaign = characterStoreCampaign(campaignId, groupId)
  return campaign && { ...campaign, collection }
}

const characterRef = (campaign: CharacterStoreScope, characterId: string) =>
  campaignDocRef(db, campaign, campaign.collection ?? 'characters', characterId)

export function isCharacterStoreSaveOutstanding(saves: CharacterStoreSaves, characterId: string): boolean {
  return Boolean(saves.pending[characterId] || saves.inFlight[characterId])
}

/** Sends every waiting save now, to the campaign it was made in, instead of when its delay runs out. */
export function sendCharacterStoreSavesNow(saves: CharacterStoreSaves) {
  Object.values(saves.pending).forEach(({ timer, send }) => {
    clearTimeout(timer)
    send()
  })
}

/**
 * Sends one character's save now, dropping its waiting delay, so the save also
 * carries any edit made just before it.
 */
export function sendCharacterStoreSaveNow<Character extends CharacterStoreRecord>(
  saves: CharacterStoreSaves,
  campaign: CharacterStoreScope,
  ruleSet: CharacterStoreRuleSet<Character>,
  characterId: string,
  readCharacter: (characterId: string) => Character | undefined,
) {
  const pending = saves.pending[characterId]
  if (pending) clearTimeout(pending.timer)
  sendCharacterStoreSave(saves, campaign, ruleSet, characterId, readCharacter)
}

/** Drops one character's waiting save without sending it, and forgets its save in flight. */
export function cancelCharacterStoreSave(saves: CharacterStoreSaves, characterId: string) {
  const pending = saves.pending[characterId]
  if (pending) {
    clearTimeout(pending.timer)
    delete saves.pending[characterId]
  }
  delete saves.inFlight[characterId]
}

/** What a save writes: the serialized record, stamped with the current version and the save time. */
export function characterStoreSaveFields<Character extends CharacterStoreRecord>(
  ruleSet: CharacterStoreRuleSet<Character>,
  character: Character,
) {
  return { ...ruleSet.parser.serialize(character), ...characterSchemaStamp(ruleSet.versioning), updatedAt: serverTimestamp() }
}

/** What a create writes: a save of the new record, with its creation time. */
export function newCharacterStoreFields<Character extends CharacterStoreRecord>(
  ruleSet: CharacterStoreRuleSet<Character>,
  character: Character,
) {
  return { ...characterStoreSaveFields(ruleSet, character), createdAt: serverTimestamp() }
}

/** Creates the character under the id it already carries, so a retried create writes the same document. */
export function createCharacterStoreDoc<Character extends CharacterStoreRecord>(
  campaign: CharacterStoreScope,
  ruleSet: CharacterStoreRuleSet<Character>,
  character: Character,
) {
  return setDoc(characterRef(campaign, character.id), newCharacterStoreFields(ruleSet, character))
}

/** Deletes the character document only; nothing stored under or beside it is touched. */
export function deleteCharacterStoreDoc(campaign: CharacterStoreScope, characterId: string) {
  return deleteDoc(characterRef(campaign, characterId))
}

export function saveCharacterStoreCurrentCharacter(campaign: CampaignScope, userId: string, characterId: string) {
  return setDoc(
    campaignUserStateRef(db, campaign, userId),
    { currentCharacterId: characterId, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

function sendCharacterStoreSave<Character extends CharacterStoreRecord>(
  saves: CharacterStoreSaves,
  campaign: CharacterStoreScope,
  ruleSet: CharacterStoreRuleSet<Character>,
  characterId: string,
  readCharacter: (characterId: string) => Character | undefined,
) {
  delete saves.pending[characterId]
  saves.inFlight[characterId] = true
  const character = readCharacter(characterId)
  if (!character) {
    delete saves.inFlight[characterId]
    return
  }
  void setDoc(characterRef(campaign, characterId), characterStoreSaveFields(ruleSet, character), { merge: true }).finally(() => {
    delete saves.inFlight[characterId]
  })
}

/**
 * Saves a character half a second after its last edit, reading it when the
 * save comes due so the save carries every edit made in between.
 */
export function scheduleCharacterStoreSave<Character extends CharacterStoreRecord>(
  saves: CharacterStoreSaves,
  campaign: CharacterStoreScope,
  ruleSet: CharacterStoreRuleSet<Character>,
  characterId: string,
  readCharacter: (characterId: string) => Character | undefined,
) {
  const existing = saves.pending[characterId]
  if (existing) clearTimeout(existing.timer)
  const send = () => sendCharacterStoreSave(saves, campaign, ruleSet, characterId, readCharacter)
  saves.pending[characterId] = { timer: setTimeout(send, CHARACTER_SAVE_DELAY_MS), send }
}
