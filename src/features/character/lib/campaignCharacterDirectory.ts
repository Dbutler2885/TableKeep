import type { CharacterRecord, Role } from '../../../types/app'
import type { CampaignPlayerOption, TransferTargetCharacter } from './characterTabTypes'
import { oseCharacterParser, type StoredCharacterFields } from './storedCharacterRecord'

type StoredCharacterDoc = { id: string; data: () => unknown }

/**
 * A stored character as the campaign directory lists it, read by OSE's parser
 * so it is listed with the items the sheet shows.
 */
export function transferTargetFromDoc(docSnap: StoredCharacterDoc): TransferTargetCharacter {
  const data = docSnap.data() as StoredCharacterFields
  const { id, name, ownerUserId, ownerUsername, details } = oseCharacterParser.parse(docSnap.id, data)
  return { id, name, ownerUserId, ownerUsername, details }
}

/** The GM sees every character; anyone else does not see the GM's own. */
export const isVisibleInDirectory = (character: TransferTargetCharacter, role: Role | null, gmUserId: string | null) =>
  role === 'gm' || character.ownerUserId !== gmUserId

/** Every character in a characters snapshot that the viewer may see. */
export function readDirectorySnapshot(docs: StoredCharacterDoc[], role: Role | null, gmUserId: string | null): TransferTargetCharacter[] {
  return docs
    .map((docSnap) => transferTargetFromDoc(docSnap))
    .filter((character) => isVisibleInDirectory(character, role, gmUserId))
}

/** The fields that say who owns a character, which is all the player list reads. */
type CharacterOwner = Pick<CharacterRecord, 'ownerUserId' | 'ownerUsername'>

const isPlayerOwned = (character: CharacterOwner, gmUserId: string | null) =>
  !!character.ownerUserId && character.ownerUserId !== gmUserId

const playerSortName = (player: CampaignPlayerOption) => player.username ?? player.userId

/** Each player who owns a listed character, once, by name and then by id. */
export function campaignPlayersFrom(characters: CharacterOwner[], gmUserId: string | null): CampaignPlayerOption[] {
  const byUser = new Map<string, CampaignPlayerOption>()
  for (const character of characters) {
    if (!isPlayerOwned(character, gmUserId)) continue
    if (!byUser.has(character.ownerUserId)) byUser.set(character.ownerUserId, { userId: character.ownerUserId, username: character.ownerUsername ?? null })
  }
  return [...byUser.values()].sort((a, b) => playerSortName(a).localeCompare(playerSortName(b)))
}
