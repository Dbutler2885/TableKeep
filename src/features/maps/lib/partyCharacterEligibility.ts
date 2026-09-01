export type PartyCharacterEligibilityFields = {
  ownerUserId?: string | null
  system?: 'ose' | 'vtm' | null
  creationStatus?: 'draft' | 'established_draft' | 'active' | null
  hpCurrent?: number | null
  incapacitated?: boolean | null
  hidden?: boolean | null
  deleted?: boolean | null
}

export function isPlayerOwnedLivingPartyCharacter(
  character: PartyCharacterEligibilityFields,
  gmUserId: string | null | undefined,
): boolean {
  if (!gmUserId) return false
  if (!character.ownerUserId) return false
  if (character.ownerUserId === gmUserId) return false
  if (character.creationStatus && character.creationStatus !== 'active') return false
  if (character.hidden === true || character.deleted === true) return false
  if (character.system === 'vtm') return character.incapacitated !== true
  return typeof character.hpCurrent === 'number' && character.hpCurrent > 0
}
