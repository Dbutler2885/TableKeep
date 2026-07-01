export type PartyCharacterEligibilityFields = {
  ownerUserId?: string | null
  hpCurrent?: number | null
}

export function isPlayerOwnedLivingPartyCharacter(
  character: PartyCharacterEligibilityFields,
  gmUserId: string | null | undefined,
): boolean {
  if (!gmUserId) return false
  if (!character.ownerUserId) return false
  if (character.ownerUserId === gmUserId) return false
  return typeof character.hpCurrent === 'number' && character.hpCurrent > 0
}
