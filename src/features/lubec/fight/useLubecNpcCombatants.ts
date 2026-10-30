import { useMemo } from 'react'
import type { Role } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { useCharacterStore } from '../../character/characterStore/useCharacterStore'
import { useNpcDocuments } from '../../npcs/hooks/useNpcDocuments'
import { createNpcWriteQueues } from '../../npcs/lib/npcWriteQueue'
import { lubecCharacterStore } from '../../ruleSets/lubec/characterParser'
import { lubecNpcCombatants } from './lubecFightCombatants'

// The fight modal only reads NPCs, so nothing here ever waits on a write.
const NO_NPC_WRITES = createNpcWriteQueues()

type NpcCombatantsOptions = CampaignScope & {
  role: Role | null
  userId: string
  gmUserId: string | null
  setError: (message: string) => void
  /** True while a fight is open: the NPCs are read for as long as they are needed and no longer. */
  open: boolean
}

/** The GM's NPCs as fight targets, each with its sheet. A player loads neither, as NPC sheets are the GM's alone. */
export function useLubecNpcCombatants({ campaignId, groupId, role, userId, gmUserId, setError, open }: NpcCombatantsOptions) {
  const enabled = open && role === 'gm'
  const { npcs } = useNpcDocuments({ campaignId, groupId }, role, NO_NPC_WRITES, enabled)
  const store = useCharacterStore({
    ruleSet: lubecCharacterStore, collection: 'npcSheets', campaignId, groupId, userId, role, gmUserId, setError, enabled,
  })
  const combatants = useMemo(() => lubecNpcCombatants(npcs, store.characters), [npcs, store.characters])
  return { combatants, store }
}
