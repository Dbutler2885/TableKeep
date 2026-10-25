import { useMemo } from 'react'
import type { Role } from '../../types/app'
import { usePlayerAssignment } from '../character/hooks/usePlayerAssignment'
import { campaignPlayersFrom } from '../character/lib/campaignCharacterDirectory'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'

export type LubecAssignmentStore = {
  characters: LubecCharacterRecord[]
  selectedCharacter: LubecCharacterRecord | null
  updateCharacter: (characterId: string, updates: Partial<LubecCharacterRecord>) => void
}

export type LubecPlayerAssignment = {
  /** OSE's assignment flow, which its Give to Player dialog renders. */
  flow: ReturnType<typeof usePlayerAssignment>
  /** Opens the dialog for the open character; null unless the viewer is the GM. */
  onAssign: (() => void) | null
}

/**
 * The GM gives the open character to a player, as OSE does: the players are
 * those who own a character in the campaign, and the new owner is saved
 * through the shared store.
 */
export function useLubecPlayerAssignment(store: LubecAssignmentStore, role: Role | null, gmUserId: string | null): LubecPlayerAssignment {
  const campaignPlayers = useMemo(() => campaignPlayersFrom(store.characters, gmUserId), [store.characters, gmUserId])
  const flow = usePlayerAssignment({ effectiveSelected: store.selectedCharacter, campaignPlayers, updateCharacter: store.updateCharacter })
  return { flow, onAssign: role === 'gm' && store.selectedCharacter ? flow.openPlayerAssignment : null }
}
