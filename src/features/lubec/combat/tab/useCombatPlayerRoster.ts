import { useMemo } from 'react'
import type { Campaign } from '../../../../types/app'
import { useCharacterStore } from '../../../character/characterStore/useCharacterStore'
import { lubecCharacterStore } from '../../../ruleSets/lubec/characterParser'
import type { CombatRosterRecords } from './combatFightCombatants'

type PlayerRosterOptions = { campaign: Campaign; userId: string; setError: (message: string) => void; enabled: boolean }

/** A player's own characters, for the attack window's hands and numbers; NPCs stay public summaries. */
export function useCombatPlayerRoster({ campaign, userId, setError, enabled }: PlayerRosterOptions): CombatRosterRecords {
  const { characters } = useCharacterStore({
    campaignId: campaign.id, groupId: campaign.groupId, userId, role: 'player', gmUserId: campaign.gmUserId ?? null,
    setError, enabled, ruleSet: lubecCharacterStore, collection: 'characters',
  })
  return useMemo(() => ({ characters: characters.filter((character) => character.ownerUserId === userId), npcs: [] }), [characters, userId])
}
