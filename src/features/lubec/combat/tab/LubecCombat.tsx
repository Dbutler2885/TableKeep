import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Campaign } from '../../../../types/app'
import type { CampaignScope } from '../../../campaign/firestorePaths'
import { campaignTabPath } from '../../../navigation/tabs'
import { requestOpen } from '../../../navigation/openRequest'
import type { LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import type { RuleSetSheetProps } from '../../../ruleSets/RuleSetSheets'
import { CombatTicker } from '../CombatMessages'
import { gmCommandKey, gmEnvelope, startEnvelope } from '../combatEnvelopes'
import { useLubecCombat, type LubecLiveFight } from '../combatWatch'
import { createCombatCommand } from '../commandJournal'
import type { CombatOutcome, CombatState } from '../engine/types'
import { useLubecCombatSend, type CombatSend } from '../useLubecCombatSend'
import { CombatEnded, CombatEndConfirm } from './CombatEnd'
import { CombatGmTools, type CombatGmTool } from './CombatGmTools'
import { CombatHead } from './CombatParts'
import { NO_ROSTER, type CombatRosterRecords } from './combatFightCombatants'
import { CombatPhaseMiddle } from './CombatPhaseMiddle'
import { useCombatPlayerRoster } from './useCombatPlayerRoster'
import { combatPhaseView } from './combatPhases'
import { CombatFloorPanel } from './CombatRails'
import { TurnOrderPanel } from './TurnOrder'
import type { CombatViewer } from './attackWords'
import { DeclarationsPanel } from './DeclarationsPanel'
import { viewerHands } from './movementModel'
import { CombatSetup, type CombatSetupStart } from './CombatSetup'
import { combatFloorSelections, type CombatSetupIssue } from './combatSetupModel'
import { useCombatGmData } from './useCombatGmData'
import './lubecCombat.css'

type LayoutProps = { state: CombatState; userId: string; role?: CombatViewer['role']; stage?: string; tools?: ReactNode; middle: ReactNode; onPlace?: (() => void) | null; hands?: readonly string[] }

/** The live tab: everyone in the fight on the left, what to do now in the middle, the declarations and the Floor on the right. */
function CombatLayout({ state, userId, role = 'gm', stage, tools = null, middle, onPlace = null, hands = [] }: LayoutProps) {
  const view = combatPhaseView(state)
  return (
    <>
      <CombatHead round={view.round} stage={stage ?? view.stage} pips={view.pips} />
      <div className="ct">
        <div className="rail"><TurnOrderPanel state={state} userId={userId} /></div>
        <div className="mid">{tools}{middle}</div>
        <div className="rail"><DeclarationsPanel state={state} viewer={{ role, userId, actingFor: null }} /><CombatFloorPanel floor={state.floor} onPlace={onPlace} hands={hands} /></div>
        <CombatTicker />
      </div>
    </>
  )
}

const refusalOf = (outcome: CombatOutcome): string | null => (outcome.ok ? null : outcome.reason)

/** The GM's fight commands, each resent unchanged until answered. */
function gmCommands(scope: CampaignScope, send: CombatSend, items: readonly LubecGmItem[]) {
  const live = async (fight: LubecLiveFight, payload: { type: string; [key: string]: unknown }) =>
    refusalOf(await send(gmCommandKey(fight, payload), () => createCombatCommand(gmEnvelope(scope, crypto.randomUUID(), fight), payload)))
  return {
    start: async (setup: CombatSetupStart) => {
      const payload = { type: 'start', combatants: setup.combatants, floor: combatFloorSelections(setup.floor, items), dodgeball: true }
      return refusalOf(await send(JSON.stringify(payload), () => createCombatCommand(startEnvelope(scope, crypto.randomUUID(), crypto.randomUUID()), payload)))
    },
    place: (fight: LubecLiveFight, item: LubecGmItem, qty: number) =>
      live(fight, { type: 'place', floor: combatFloorSelections([{ itemId: item.id, status: item.status, qty }], items) }),
    end: (fight: LubecLiveFight) => live(fight, { type: 'end' }),
  }
}

type Closing = { live: LubecLiveFight; done: boolean }

/** The fight End is closing, while it is still the one shown: a new live fight replaces it. */
const shownClosing = (closing: Closing | null, live: LubecLiveFight | null): Closing | null =>
  (closing && (!live || live.id === closing.live.id) ? { ...closing, live: live ?? closing.live } : null)

type GmProps = { campaign: Campaign; userId: string; setError: (message: string) => void }

function useGmCombat({ campaign, userId, setError }: GmProps) {
  const scope = useMemo(() => ({ groupId: campaign.groupId, campaignId: campaign.id }), [campaign.groupId, campaign.id])
  const send = useLubecCombatSend(userId)
  const data = useCombatGmData({ campaign, userId, setError })
  const commands = useMemo(() => gmCommands(scope, send, data.items), [scope, send, data.items])
  const navigate = useNavigate()
  const repair = (issue: CombatSetupIssue) => {
    requestOpen(issue.selection.kind, issue.selection.sheetId)
    void navigate(campaignTabPath(campaign.groupId, campaign.id, issue.selection.kind === 'npc' ? 'npcs' : 'character'))
  }
  return { commands, repair, data, send }
}

type ClosingProps = { shown: Closing; userId: string; onEnd: () => Promise<string | null>; onPlaceInstead: () => void }

/** Moment 12: the End confirmation, then its result once End has committed. */
function CombatClosing({ shown, userId, onEnd, onPlaceInstead }: ClosingProps) {
  const { state } = shown.live.fight
  if (shown.done) return <CombatLayout state={state} userId={userId} stage="Ending" middle={<CombatEnded state={state} />} />
  return <CombatLayout state={state} userId={userId} stage="Ending" middle={<CombatEndConfirm state={state} onEnd={onEnd} />} onPlace={onPlaceInstead} />
}

type ActingFor = { attackId: string | null; stage: string; key: string }

/** Acting for an absent player lasts for the one attack or stage it was chosen for. */
const actingNow = (actingFor: ActingFor | null, attackId: string | null, stage: string): string | null =>
  (actingFor?.attackId === attackId && actingFor.stage === stage ? actingFor.key : null)

type GmLiveProps = {
  campaign: Campaign
  live: LubecLiveFight
  userId: string
  roster: CombatRosterRecords
  send: CombatSend
  tool: CombatGmTool
  onTool: (tool: CombatGmTool) => void
  items: readonly LubecGmItem[]
  place: (item: LubecGmItem, qty: number) => Promise<string | null>
  onEnd: () => void
  setError: (message: string) => void
}

/** The GM's live fight: tools over the middle, Before initiative's grants, and placement onto the Floor. */
function CombatGmLive({ campaign, live, userId, roster, send, tool, onTool, items, place, onEnd, setError }: GmLiveProps) {
  const [placing, setPlacing] = useState(false)
  const [actingFor, setActingFor] = useState<ActingFor | null>(null)
  const { state } = live.fight
  const placeOnFloor = async (item: LubecGmItem, qty: number) => {
    setPlacing(true)
    const refusal = await place(item, qty)
    setPlacing(false)
    if (refusal) setError(refusal)
    else onTool('')
  }
  const tools = <CombatGmTools tool={tool} onTool={onTool} items={items} placing={placing} onPlace={(item, qty) => void placeOnFloor(item, qty)} onEnd={onEnd} />
  const attackId = state.attack?.id ?? null
  const viewer = { role: 'gm' as const, userId, actingFor: actingNow(actingFor, attackId, state.stageInstanceId) }
  const middle = <CombatPhaseMiddle campaign={campaign} live={live} viewer={viewer} roster={roster} send={send} onActFor={(key) => setActingFor({ attackId, stage: state.stageInstanceId, key })} />
  return <CombatLayout state={state} userId={userId} tools={tools} middle={middle} onPlace={() => onTool('place')} />
}

/** The GM's tab: set up a fight, run Before initiative and place items, and end it. */
function CombatGm(props: GmProps) {
  const { live } = useLubecCombat()
  const { commands, repair, data, send } = useGmCombat(props)
  const [closing, setClosing] = useState<Closing | null>(null)
  const [tool, setTool] = useState<CombatGmTool>('')
  const shown = shownClosing(closing, live)
  if (shown) {
    const end = async () => {
      const refusal = await commands.end(shown.live)
      if (!refusal) setClosing({ live: shown.live, done: true })
      return refusal
    }
    return <CombatClosing shown={shown} userId={props.userId} onEnd={end} onPlaceInstead={() => { setClosing(null); setTool('place') }} />
  }
  if (!live) return <CombatSetup {...data} onStart={commands.start} onRepair={repair} />
  return (
    <CombatGmLive
      campaign={props.campaign} live={live} userId={props.userId} roster={data.roster} send={send} tool={tool} onTool={setTool} items={data.items} setError={props.setError}
      place={(item, qty) => commands.place(live, item, qty)}
      onEnd={() => { setTool(''); setClosing({ live, done: false }) }}
    />
  )
}

type ViewerProps = { campaign: Campaign; userId: string; setError: (message: string) => void }

/** A player's tab, in the fight or watching it: the rails, their own controls when something waits on them, and who the fight is waiting on. */
function CombatPlayer({ campaign, userId, setError }: ViewerProps) {
  const { live } = useLubecCombat()
  const send = useLubecCombatSend(userId)
  const inFight = Boolean(live?.fight.state.combatants.some((combatant) => combatant.ownerUserId === userId))
  const roster = useCombatPlayerRoster({ campaign, userId, setError, enabled: inFight })
  if (!live) return null
  const viewer = { role: 'player' as const, userId, actingFor: null }
  const middle = <CombatPhaseMiddle campaign={campaign} live={live} viewer={viewer} roster={inFight ? roster : NO_ROSTER} send={send} onActFor={() => undefined} />
  return <CombatLayout state={live.fight.state} userId={userId} role="player" middle={middle} hands={viewerHands(live.fight.state, viewer, roster)} />
}

/** Lubec's Combat tab. Players have it only while a fight is live; the route gate sends them away otherwise. */
export function LubecCombat({ campaign, role, user, setError }: RuleSetSheetProps) {
  return (
    <div className="lubec-combat">
      {role === 'gm' ? <CombatGm campaign={campaign} userId={user.uid} setError={setError} /> : <CombatPlayer campaign={campaign} userId={user.uid} setError={setError} />}
    </div>
  )
}
