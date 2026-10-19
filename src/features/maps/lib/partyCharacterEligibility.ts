import type { StoredCharacter } from '../../ruleSets/storedCharacter'
import { mapCharacterSummary } from './mapCharacterSummary'

export type PartyCharacterEligibilityFields = {
  ownerUserId?: string | null
  creationStatus?: 'draft' | 'established_draft' | 'active' | null
  // The character's rule set says it is in play.
  inPlay: boolean
  hidden?: boolean | null
  deleted?: boolean | null
}

// Owned by a player, never by the GM; with no GM known nobody qualifies.
const isPlayerOwned = (character: PartyCharacterEligibilityFields, gmUserId: string | null | undefined) =>
  Boolean(gmUserId) && Boolean(character.ownerUserId) && character.ownerUserId !== gmUserId

// Finished, and neither hidden nor deleted. A character with no creation
// status predates drafts and counts as finished.
const isActiveAndShown = (character: PartyCharacterEligibilityFields) =>
  (!character.creationStatus || character.creationStatus === 'active')
  && character.hidden !== true
  && character.deleted !== true

/** Whether a map summary is a player's finished, visible character that is in play. */
export function isPartyCharacter(
  character: PartyCharacterEligibilityFields,
  gmUserId: string | null | undefined,
): boolean {
  return isPlayerOwned(character, gmUserId) && isActiveAndShown(character) && character.inPlay
}

/**
 * The same test for a character record that has not been through the map
 * summary yet, such as the embedded sheet's list. The record has already been
 * read through its rule set's steps, so they do not run again. A map summary
 * cannot be passed here, because its rule set has already read it.
 */
export function isPlayerOwnedLivingPartyCharacter(
  character: StoredCharacter & { id: string; inPlay?: never },
  gmUserId: string | null | undefined,
): boolean {
  return isPartyCharacter(mapCharacterSummary(character.id, character), gmUserId)
}
