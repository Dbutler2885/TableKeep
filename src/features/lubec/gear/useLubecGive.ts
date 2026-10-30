import type { Role } from '../../../types/app'
import type { LubecCharacterRecord } from '../../ruleSets/lubec/characterRecord'
import { usePendingTransfers } from '../../transfers/usePendingTransfers'
import type { LubecGearDropStore } from './lubecGearDrop'
import { lubecGearGive, type LubecGearGive } from './lubecGive'

type LubecGiveHookOptions = {
  /** True on the campaign's characters; an NPC's sheet has no player to give for it. */
  onCharacters: boolean
  character: LubecCharacterRecord | null
  characters: readonly LubecCharacterRecord[]
  store: LubecGearDropStore
  campaignId: string
  groupId: string
  role: Role | null
  userId: string
}

/**
 * The open sheet's way of giving things away. Only a character's owner may make
 * an offer, which is what `firestore.rules` lets through, so anyone else, the
 * GM included, gets none.
 */
export function useLubecGive({ onCharacters, character, characters, store, campaignId, groupId, role, userId }: LubecGiveHookOptions): LubecGearGive | null {
  const { outgoingTransfers, createTransfer, cancelTransfer } = usePendingTransfers(onCharacters ? campaignId : null, onCharacters ? groupId : null, role, userId)
  if (!onCharacters || character?.ownerUserId !== userId) return null
  return lubecGearGive({ from: character, characters, outgoing: outgoingTransfers, store, createTransfer, cancelTransfer })
}
