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
import { BeforeInitiativeGm, CombatWaiting } from './CombatMiddles'
import { CombatHead } from './CombatParts'
import { combatPhaseView } from './combatPhases'
import { CombatFloorPanel, InFightPanel } from './CombatRails'
import { CombatSetup, type CombatSetupStart } from './CombatSetup'
import { combatFloorSelections, type CombatSetupIssue } from './combatSetupModel'
import { useCombatGmData } from './useCombatGmData'
import './lubecCombat.css'

type LayoutProps = { state: CombatState; userId: string; stage?: string; tools?: ReactNode; middle: ReactNode; onPlace?: (() => void) | null }

/** The live tab: everyone in the fight on the left, what to do now in the middle, the Floor on the right. */
function CombatLayout({ state, userId, stage, tools = null, middle, onPlace = null }: LayoutProps) {
  const view = combatPhaseView(state)
  return (
    <>
      <CombatHead round={view.round} stage={stage ?? view.stage} />
      <div className="ct">
        <div className="rail"><InFightPanel combatants={state.combatants} userId={userId} /></div>
        <div className="mid">{tools}{middle}</div>
        <div className="rail"><CombatFloorPanel floor={state.floor} onPlace={onPlace} /></div>
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
  return { commands, repair, data }
}

type ClosingProps = { shown: Closing; userId: string; onEnd: () => Promise<string | null>; onPlaceInstead: () => void }

/** Moment 12: the End confirmation, then its result once End has committed. */
function CombatClosing({ shown, userId, onEnd, onPlaceInstead }: ClosingProps) {
  const { state } = shown.live.fight
  if (shown.done) return <CombatLayout state={state} userId={userId} stage="Ending" middle={<CombatEnded state={state} />} />
  return <CombatLayout state={state} userId={userId} stage="Ending" middle={<CombatEndConfirm state={state} onEnd={onEnd} />} onPlace={onPlaceInstead} />
}

type GmLiveProps = {
  live: LubecLiveFight
  userId: string
  tool: CombatGmTool
  onTool: (tool: CombatGmTool) => void
  items: readonly LubecGmItem[]
  place: (item: LubecGmItem, qty: number) => Promise<string | null>
  onEnd: () => void
  setError: (message: string) => void
}

/** The GM's live fight: tools over the middle, Before initiative's grants, and placement onto the Floor. */
function CombatGmLive({ live, userId, tool, onTool, items, place, onEnd, setError }: GmLiveProps) {
  const [placing, setPlacing] = useState(false)
  const { state } = live.fight
  const placeOnFloor = async (item: LubecGmItem, qty: number) => {
    setPlacing(true)
    const refusal = await place(item, qty)
    setPlacing(false)
    if (refusal) setError(refusal)
    else onTool('')
  }
  const tools = <CombatGmTools tool={tool} onTool={onTool} items={items} placing={placing} onPlace={(item, qty) => void placeOnFloor(item, qty)} onEnd={onEnd} />
  const middle = state.phase === 'before-initiative' ? <BeforeInitiativeGm state={state} /> : <CombatWaiting state={state} />
  return <CombatLayout state={state} userId={userId} tools={tools} middle={middle} onPlace={() => onTool('place')} />
}

/** The GM's tab: set up a fight, run Before initiative and place items, and end it. */
function CombatGm(props: GmProps) {
  const { live } = useLubecCombat()
  const { commands, repair, data } = useGmCombat(props)
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
      live={live} userId={props.userId} tool={tool} onTool={setTool} items={data.items} setError={props.setError}
      place={(item, qty) => commands.place(live, item, qty)}
      onEnd={() => { setTool(''); setClosing({ live, done: false }) }}
    />
  )
}

/** A player's tab, in the fight or watching it: the rails and who the fight is waiting on. */
function CombatViewer({ userId }: { userId: string }) {
  const { live } = useLubecCombat()
  if (!live) return null
  return <CombatLayout state={live.fight.state} userId={userId} middle={<CombatWaiting state={live.fight.state} />} />
}

/** Lubec's Combat tab. Players have it only while a fight is live; the route gate sends them away otherwise. */
export function LubecCombat({ campaign, role, user, setError }: RuleSetSheetProps) {
  return (
    <div className="lubec-combat">
      {role === 'gm' ? <CombatGm campaign={campaign} userId={user.uid} setError={setError} /> : <CombatViewer userId={user.uid} />}
    </div>
  )
}
