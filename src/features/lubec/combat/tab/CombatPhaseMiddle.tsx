import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Campaign } from '../../../../types/app'
import { campaignTabPath } from '../../../navigation/tabs'
import { requestOpen } from '../../../navigation/openRequest'
import type { LubecLiveFight } from '../combatWatch'
import type { CombatSend } from '../useLubecCombatSend'
import { attackCommands } from './attackCommands'
import type { CombatViewer } from './attackWords'
import { BeforeInitiativeMiddle } from './BeforeInitiativeMiddle'
import type { CombatRosterRecords } from './combatFightCombatants'
import { CombatWaiting } from './CombatMiddles'
import { InitiativeMiddle } from './InitiativeMiddle'

type PhaseProps = {
  campaign: Campaign
  live: LubecLiveFight
  viewer: CombatViewer
  roster: CombatRosterRecords
  send: CombatSend
  onActFor: (key: string) => void
}

/** The middle for the fight's phase; later phases arrive with their own slices. */
export function CombatPhaseMiddle({ campaign, live, viewer, roster, send, onActFor }: PhaseProps) {
  const navigate = useNavigate()
  const scope = useMemo(() => ({ groupId: campaign.groupId, campaignId: campaign.id }), [campaign.groupId, campaign.id])
  const commands = useMemo(() => attackCommands(scope, live, send), [scope, live, send])
  const { state } = live.fight
  if (state.phase === 'initiative') return <InitiativeMiddle state={state} viewer={viewer} commands={commands} />
  if (state.phase !== 'before-initiative') return <CombatWaiting state={state} />
  // Tapping a hand opens that sheet's inventory: the character's own, or for the GM an NPC's sheet.
  const onInventory = (attacker: { kind: 'character' | 'npc'; sheetId: string }) => {
    requestOpen(attacker.kind, attacker.sheetId)
    void navigate(campaignTabPath(campaign.groupId, campaign.id, attacker.kind === 'npc' ? 'npcs' : 'character'))
  }
  return <BeforeInitiativeMiddle state={state} fightId={live.id} viewer={viewer} roster={roster} commands={commands} onActFor={onActFor} onInventory={onInventory} />
}
