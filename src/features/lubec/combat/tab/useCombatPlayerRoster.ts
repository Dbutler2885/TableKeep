import { useMemo } from 'react'
import type { Campaign } from '../../../../types/app'
import { useCharacterStore } from '../../../character/characterStore/useCharacterStore'
import { lubecCharacterStore } from '../../../ruleSets/lubec/characterParser'
import type { CombatRosterRecords } from './combatFightCombatants'
import type { CombatSheetWriter } from './fighterEffectsModel'
import { combatSheetWriter } from './combatSheetWriter'

type PlayerRosterOptions = { campaign: Campaign; userId: string; setError: (message: string) => void; enabled: boolean }

/** A player's roster and the store that saves it. */
export type CombatPlayerRoster = { roster: CombatRosterRecords; writer: CombatSheetWriter }

/** A player's own characters, for the attack window's hands and numbers and their effects; NPCs stay public summaries. */
export function useCombatPlayerRoster({ campaign, userId, setError, enabled }: PlayerRosterOptions): CombatPlayerRoster {
  const store = useCharacterStore({
    campaignId: campaign.id, groupId: campaign.groupId, userId, role: 'player', gmUserId: campaign.gmUserId ?? null,
    setError, enabled, ruleSet: lubecCharacterStore, collection: 'characters',
  })
  const { characters } = store
  const roster = useMemo(() => ({ characters: characters.filter((character) => character.ownerUserId === userId), npcs: [] }), [characters, userId])
  return { roster, writer: combatSheetWriter(store, 'characters', { groupId: campaign.groupId, campaignId: campaign.id }) }
}
