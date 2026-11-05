import { useState, type ReactNode } from 'react'
import type { Combatant, CombatState } from '../engine/types'
import { SegmentRoll } from './AttackBar'
import type { AttackAct, AttackCommands } from './attackCommands'
import type { CombatViewer } from './attackWords'
import { CombatStepper, CombatWindow } from './CombatParts'
import { RollBar } from './RollBar'

const pad = (value: number) => String(value).padStart(2, '0')
const inFight = (state: CombatState) => state.combatants.filter((entry) => entry.outReason === null)

/** One Roll at a time: pressed, it waits on the table and shows a refusal. */
function useRun() {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const run = async (act: () => AttackAct) => {
    setBusy(true)
    setRefusal(await act())
    setBusy(false)
  }
  return { busy, refusal, run: (act: () => AttackAct) => void run(act) }
}

function Refusal({ refusal }: { refusal: string | null }) {
  return refusal ? <div className="notice hot" role="alert"><span>{refusal}</span></div> : null
}

function Verdict({ combatant }: { combatant: Combatant }) {
  const rolled = combatant.initiative!
  const words = rolled.success ? `${pad(rolled.roll)} is under ${rolled.speed}: a success.` : `${pad(rolled.roll)} is not under ${rolled.speed}: a failure.`
  return <p className={`verdict init ${rolled.success ? 'ok' : 'bad'}`}>{words}</p>
}

type RollProps = { combatant: Combatant; named: boolean; commands: AttackCommands }

const rollPrompt = (combatant: Combatant, named: boolean): string =>
  (named ? `${combatant.name}: roll initiative, d100 under Speed.` : 'Roll initiative: d100 under your Speed.')

function RollButton({ combatant, commands, act }: { combatant: Combatant; commands: AttackCommands; act: ReturnType<typeof useRun> }) {
  return <SegmentRoll at={Math.max(8, combatant.speed / 2)} label="Roll" disabled={act.busy} onRoll={() => act.run(() => commands.initiative(combatant.key))} />
}

/** The player's own roll on their Speed bar: d100 under Speed, once. */
function InitiativeRoll({ combatant, named, commands }: RollProps) {
  const act = useRun()
  const rolled = combatant.initiative ?? null
  return (
    <div className="initiative-roll">
      <p className="ask">{rollPrompt(combatant, named)}</p>
      <Refusal refusal={act.refusal} />
      <RollBar value={combatant.speed} tag="SPEED" roll={rolled} controls={rolled ? null : <RollButton combatant={combatant} commands={commands} act={act} />} />
      {rolled ? <Verdict combatant={combatant} /> : null}
    </div>
  )
}

const RollWindow = ({ children }: { children: ReactNode }) => (
  <CombatWindow title="Roll initiative" stepper={<CombatStepper steps={['Roll', 'Order']} now={0} />} foot={<span className="note">Waiting for everyone to roll. The order fills in on the left.</span>}>{children}</CombatWindow>
)

/** Moment 3 for a player in the fight: each of their combatants rolls on their own Speed bar. */
function PlayerInitiative({ owned, commands }: { owned: Combatant[]; commands: AttackCommands }) {
  return <RollWindow>{owned.map((combatant) => <InitiativeRoll key={combatant.key} combatant={combatant} named={owned.length > 1} commands={commands} />)}</RollWindow>
}

function RolledBadge({ combatant, waiting }: { combatant: Combatant; waiting: string }) {
  const rolled = combatant.initiative
  return rolled ? <span className="badge pine">Rolled {pad(rolled.roll)}</span> : <span className="badge gray">{waiting}</span>
}

function PlayerRow({ combatant, commands, run, busy }: { combatant: Combatant; commands: AttackCommands; run: (act: () => AttackAct) => void; busy: boolean }) {
  return (
    <li>
      <span>{combatant.name}<small className="roster-speed"> · Speed {combatant.speed}</small></span>
      <RolledBadge combatant={combatant} waiting="Rolling on their screen" />
      {combatant.initiative ? null : <button type="button" className="btn line small rowbtn" title="Use this if the player is away from the table" disabled={busy} onClick={() => run(() => commands.initiative(combatant.key))}>Away: roll for {combatant.name}</button>}
    </li>
  )
}

/** Moment 3 for the GM: the NPCs rolled with one button, the players rolling on their own screens. */
function GmInitiative({ state, commands }: { state: CombatState; commands: AttackCommands }) {
  const act = useRun()
  const npcs = inFight(state).filter((entry) => entry.kind === 'npc')
  const players = inFight(state).filter((entry) => entry.kind === 'character')
  return (
    <RollWindow>
      <Refusal refusal={act.refusal} />
      <div className="two-col">
        <div>
          <span className="label">You roll for the NPCs</span>
          <ul className="roster spaced">{npcs.map((npc) => <li key={npc.key}><span>{npc.name}<small className="roster-speed"> · Speed {npc.speed}</small></span><RolledBadge combatant={npc} waiting="Not rolled" /></li>)}</ul>
          <p className="roll-npcs"><button type="button" className="btn rust" disabled={act.busy || npcs.every((npc) => npc.initiative)} onClick={() => act.run(commands.npcInitiative)}>Roll for NPCs</button></p>
        </div>
        <div>
          <span className="label">Players roll for themselves</span>
          <ul className="roster spaced">{players.map((player) => <PlayerRow key={player.key} combatant={player} commands={commands} run={act.run} busy={act.busy} />)}</ul>
        </div>
      </div>
    </RollWindow>
  )
}

/** Everyone else waits on the rolls still to come. */
function InitiativeWaiting({ state }: { state: CombatState }) {
  const waiting = inFight(state).filter((entry) => !entry.initiative).map((entry) => entry.name)
  return (
    <RollWindow>
      <div className="bigwait">
        <span className="label">Initiative</span>
        <h3>Waiting for everyone to roll<span className="dots" /></h3>
        <p>Still to roll: {waiting.join(', ')}.</p>
      </div>
    </RollWindow>
  )
}

/** Moment 3: who rolls what, for this viewer. */
export function InitiativeMiddle({ state, viewer, commands }: { state: CombatState; viewer: CombatViewer; commands: AttackCommands }) {
  if (viewer.role === 'gm') return <GmInitiative state={state} commands={commands} />
  const owned = inFight(state).filter((entry) => entry.kind === 'character' && entry.ownerUserId === viewer.userId)
  return owned.length ? <PlayerInitiative owned={owned} commands={commands} /> : <InitiativeWaiting state={state} />
}
