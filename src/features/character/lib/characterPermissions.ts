import type { CharacterRecord, Role } from '../../../types/app'

type Params = { role: Role | null; currentUserId: string; character: CharacterRecord | null; grantMode: boolean }

export const canDeleteCharacterForRole = (role: Role | null, currentUserId: string, character: CharacterRecord) =>
  role === 'gm' || character.ownerUserId === currentUserId

export const deriveCharacterPermissions = ({ role, currentUserId, character, grantMode }: Params) => {
  const canEditSelected = !!character && (role === 'gm' || character.ownerUserId === currentUserId)
  const isGuidedCreation = character?.creationStatus === 'draft'
  const isEstablishedDraft = character?.creationStatus === 'established_draft'
  const isInFinalizationFlow = isGuidedCreation || isEstablishedDraft
  return {
    canCreateCharacter: role === 'gm' || role === 'player',
    canEditSelected,
    canEditInventoryDetails: role === 'gm' && canEditSelected,
    canGrant: role === 'gm',
    canSetCurrentCharacter: role === 'player' && !!character && character.ownerUserId === currentUserId,
    canDeleteSelected: !!character && (role === 'gm' || character.ownerUserId === currentUserId),
    canAssignCharacter: role === 'gm' && !!character && !grantMode,
    isGuidedCreation,
    isEstablishedDraft,
    isInFinalizationFlow,
    canEditClassAndAlignment: !!character && canEditSelected && isInFinalizationFlow,
    canMemorizeSpell: !!character && !isInFinalizationFlow,
    requiresSpellLearnApproval: role !== 'gm' && !isInFinalizationFlow,
    requiresApprovalNow: role !== 'gm' && !isEstablishedDraft,
    canEditAbilityScores: !!character && canEditSelected && (isGuidedCreation || character.creationMode === 'established'),
    canClassEquipArmour: character?.className !== 'Magic-User',
  }
}
