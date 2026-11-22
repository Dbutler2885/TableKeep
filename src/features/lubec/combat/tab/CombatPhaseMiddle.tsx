import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Campaign } from '../../../../types/app'
import { campaignTabPath } from '../../../navigation/tabs'
import { requestOpen } from '../../../navigation/openRequest'
import type { LubecLiveFight } from '../combatWatch'
import type { CombatSend } from '../useLubecCombatSend'
import { attackCommands, type AttackCommands } from './attackCommands'
import type { CombatViewer } from './attackWords'
import { BeforeInitiativeMiddle } from './BeforeInitiativeMiddle'
import type { CombatRosterRecords } from './combatFightCombatants'
import { DeclareMiddle } from './DeclareMiddle'
import { InitiativeMiddle } from './InitiativeMiddle'
import { MovementMiddle } from './MovementMiddle'
import { LastResult, RoundAttackMiddle } from './RoundAttackMiddle'
import type { Combatant, CombatState } from '../engine/types'

type MiddleProps = {
  state: CombatState
  fightId: string
  viewer: CombatViewer
  roster: CombatRosterRecords
  commands: AttackCommands
  onActFor: (key: string) => void
  onInventory: (attacker: Combatant) => void
}

/** Each phase's middle. */
const PHASE_MIDDLES: Readonly<Record<string, (props: MiddleProps) => ReactNode>> = {
  'before-initiative': (props) => <BeforeInitiativeMiddle {...props} />,
  initiative: (props) => <InitiativeMiddle state={props.state} viewer={props.viewer} commands={props.commands} />,
  movement: (props) => <><LastResult state={props.state} /><MovementMiddle {...props} /></>,
  declare: (props) => <DeclareMiddle {...props} />,
  attack: (props) => <RoundAttackMiddle {...props} />,
}

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
  // Inventory opens the active fighter's Gear page; hand cards select the attack source in place.
  const onInventory = (attacker: { kind: 'character' | 'npc'; sheetId: string }) => {
    requestOpen(attacker.kind, attacker.sheetId, 'gear')
    void navigate(campaignTabPath(campaign.groupId, campaign.id, attacker.kind === 'npc' ? 'npcs' : 'character'))
  }
  const props = { state, fightId: live.id, viewer, roster, commands, onActFor, onInventory }
  return PHASE_MIDDLES[state.phase](props)
}
