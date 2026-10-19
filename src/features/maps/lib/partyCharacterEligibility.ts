export type PartyCharacterEligibilityFields = {
  ownerUserId?: string | null
  system?: 'ose' | 'vtm' | null
  creationStatus?: 'draft' | 'established_draft' | 'active' | null
  hpCurrent?: number | null
  incapacitated?: boolean | null
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

const isAlive = (character: PartyCharacterEligibilityFields) =>
  character.system === 'vtm'
    ? character.incapacitated !== true
    : typeof character.hpCurrent === 'number' && character.hpCurrent > 0

export function isPlayerOwnedLivingPartyCharacter(
  character: PartyCharacterEligibilityFields,
  gmUserId: string | null | undefined,
): boolean {
  return isPlayerOwned(character, gmUserId) && isActiveAndShown(character) && isAlive(character)
}
