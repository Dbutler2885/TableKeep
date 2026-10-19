import type { CharacterRecord, Role } from '../../../types/app'
import type { CampaignPlayerOption, TransferTargetCharacter } from './characterTabTypes'

type StoredCharacterDoc = { id: string; data: () => unknown }

type StoredDirectoryFields = {
  name?: string
  ownerUserId?: string
  ownerUsername?: string | null
  details?: CharacterRecord['details']
}

/** A stored character as the campaign directory lists it. */
export function transferTargetFromDoc(docSnap: StoredCharacterDoc): TransferTargetCharacter {
  const data = docSnap.data() as StoredDirectoryFields
  return {
    id: docSnap.id,
    name: data.name ?? docSnap.id,
    ownerUserId: data.ownerUserId ?? '',
    ownerUsername: typeof data.ownerUsername === 'string' ? data.ownerUsername : null,
    details: data.details ?? null,
  }
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

const isPlayerOwned = (character: TransferTargetCharacter, gmUserId: string | null) =>
  !!character.ownerUserId && character.ownerUserId !== gmUserId

const playerSortName = (player: CampaignPlayerOption) => player.username ?? player.userId

/** Each player who owns a listed character, once, by name and then by id. */
export function campaignPlayersFrom(characters: TransferTargetCharacter[], gmUserId: string | null): CampaignPlayerOption[] {
  const byUser = new Map<string, CampaignPlayerOption>()
  for (const character of characters) {
    if (!isPlayerOwned(character, gmUserId)) continue
    if (!byUser.has(character.ownerUserId)) byUser.set(character.ownerUserId, { userId: character.ownerUserId, username: character.ownerUsername ?? null })
  }
  return [...byUser.values()].sort((a, b) => playerSortName(a).localeCompare(playerSortName(b)))
}
