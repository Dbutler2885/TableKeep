import { useMemo } from 'react'
import type { Campaign } from '../../../../types/app'
import { useCharacterStore } from '../../../character/characterStore/useCharacterStore'
import { useNpcDocuments } from '../../../npcs/hooks/useNpcDocuments'
import { createNpcWriteQueues } from '../../../npcs/lib/npcWriteQueue'
import { lubecCharacterStore } from '../../../ruleSets/lubec/characterParser'
import { lubecGmItemsOldestFirst } from '../../items/gmItemsList'
import { useLubecGmItems } from '../../items/useLubecGmItems'
import { characterCombatSheets, npcCombatSheet } from './combatSheets'

// Setup only reads NPCs, so nothing here ever waits on a write.
const NO_NPC_WRITES = createNpcWriteQueues()

type GmDataOptions = { campaign: Campaign; userId: string; setError: (message: string) => void }

/** What the GM sets a fight up from and runs it with: characters in play, NPCs with their sheets, every GM item, and the sheets themselves. GM-only reads. */
export function useCombatGmData({ campaign, userId, setError }: GmDataOptions) {
  const scope = { campaignId: campaign.id, groupId: campaign.groupId }
  const store = { ...scope, userId, role: 'gm' as const, gmUserId: campaign.gmUserId ?? null, setError, enabled: true, ruleSet: lubecCharacterStore }
  const characters = useCharacterStore({ ...store, collection: 'characters' }).characters
  const npcSheets = useCharacterStore({ ...store, collection: 'npcSheets' }).characters
  const { npcs } = useNpcDocuments(scope, 'gm', NO_NPC_WRITES)
  const items = useLubecGmItems(scope, 'all', setError)
  return useMemo(() => ({
    characters: characterCombatSheets(characters),
    npcs: npcs.map((npc) => {
      const sheet = npcSheets.find((candidate) => candidate.id === npc.id)
      return { npc, sheet: sheet ? npcCombatSheet(npc, sheet) : null }
    }),
    items: lubecGmItemsOldestFirst(items ?? []),
    roster: { characters, npcs: npcs.map((npc) => ({ npc, sheet: npcSheets.find((candidate) => candidate.id === npc.id) ?? null })) },
  }), [characters, npcSheets, npcs, items])
}
