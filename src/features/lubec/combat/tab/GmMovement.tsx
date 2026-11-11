import { useState } from 'react'
import type { Combatant, CombatMovement, CombatState } from '../engine/types'
import type { MovementPick } from './attackCommands'
import { combatFloorRows } from './combatFloorRows'
import { PhaseStepper } from './CombatMiddles'
import { CombatWindow } from './CombatParts'
import { CombatRefusal } from './CombatParts'
import { useCombatRun, type CombatRun } from './useCombatRun'
import { MOVEMENT_NAMES, movementSheetOf } from './movementModel'
import { MovementFloor, MoveWindow, type MovementProps } from './MovementParts'

const PICKUP = 'pickup:'

/** The GM's choices for an NPC: Pick up names its Floor row when there is more than one. */
function npcOptions(state: CombatState): (readonly [string, string])[] {
  const rows = combatFloorRows(state.floor)
  const pickups = rows.map((row) => [`${PICKUP}${row.recordIds[0]}`, rows.length === 1 ? 'Pick up' : `Pick up: ${row.item.name}`] as const)
  return [['stay', MOVEMENT_NAMES.stay], ['run', MOVEMENT_NAMES.run], ['evade', MOVEMENT_NAMES.evade], ...pickups, ['leave', MOVEMENT_NAMES.leave]]
}

const npcPick = (value: string): MovementPick =>
  (value.startsWith(PICKUP) ? { choice: 'pickup', pickup: { itemId: value.slice(PICKUP.length), qty: 1 } } : { choice: value as MovementPick['choice'], pickup: null })

const movementValue = (movement: CombatMovement): string => (movement.pickup ? `${PICKUP}${movement.pickup.itemId}` : movement.choice)

/** What the GM sees of a player's choice: all of it, once it is in. */
function playerBadge(movement: CombatMovement | null | undefined): readonly [string, string] {
  if (!movement) return ['Choosing...', 'gray']
  return [movement.leave === 'asked' ? 'Leave the fight (needs you)' : MOVEMENT_NAMES[movement.choice], 'pine']
}

function PlayerRow({ combatant, onActFor }: { combatant: Combatant; onActFor: (key: string) => void }) {
  const [words, tone] = playerBadge(combatant.movement)
  return (
    <li>
      <span>{combatant.name}<small className="inline">Player: chooses on their own screen</small></span>
      <span className={`badge ${tone}`}>{words}</span>
      {combatant.movement ? null : <button type="button" className="btn line small rowbtn" title="Use this if the player is away from the table" onClick={() => onActFor(combatant.key)}>Away: choose for {combatant.name}</button>}
    </li>
  )
}

type NpcRowProps = { combatant: Combatant; options: (readonly [string, string])[]; value: string; onChoose: (value: string) => void }

function NpcRow({ combatant, options, value, onChoose }: NpcRowProps) {
  const shown = combatant.movement ? movementValue(combatant.movement) : value
  return (
    <li>
      <span>{combatant.name}<small className="inline">NPC: you choose</small></span>
      <select aria-label={`${combatant.name} movement`} value={shown} disabled={Boolean(combatant.movement)} onChange={(event) => onChoose(event.target.value)}>
        {options.map(([option, label]) => <option key={option} value={option}>{label}</option>)}
      </select>
    </li>
  )
}

function OutRow({ combatant }: { combatant: Combatant }) {
  return <li className="off"><span>{combatant.name}</span><span className="badge rust">Out</span></li>
}

type LeaveProps = { combatant: Combatant; run: CombatRun; onAnswer: (confirm: boolean) => void }

/** A player asks to Leave: the stage waits on the GM's answer. */
function LeaveAsk({ combatant, run, onAnswer }: LeaveProps) {
  return (
    <div className="notice hot">
      <span>
        <b>{combatant.name} asks to Leave.</b> Confirm only if there is a way out.{' '}
        <button type="button" className="btn line small" disabled={run.busy} onClick={() => onAnswer(true)}>Confirm</button>{' '}
        <button type="button" className="btn line small" disabled={run.busy} onClick={() => onAnswer(false)}>Refuse</button>
      </span>
    </div>
  )
}

type RowsProps = { state: CombatState; choices: Record<string, string>; onChoose: (key: string, value: string) => void; onActFor: (key: string) => void }

function MovementRows({ state, choices, onChoose, onActFor }: RowsProps) {
  const options = npcOptions(state)
  const row = (combatant: Combatant) => {
    if (combatant.outReason !== null) return <OutRow key={combatant.key} combatant={combatant} />
    if (combatant.kind === 'character') return <PlayerRow key={combatant.key} combatant={combatant} onActFor={onActFor} />
    return <NpcRow key={combatant.key} combatant={combatant} options={options} value={choices[combatant.key] ?? 'stay'} onChoose={(value) => onChoose(combatant.key, value)} />
  }
  return <ul className="roster">{state.combatants.map(row)}</ul>
}

const choosingNpcs = (state: CombatState): Combatant[] => state.combatants.filter((entry) => entry.kind === 'npc' && entry.outReason === null && !entry.movement)

function GmFoot({ state, run, onConfirm }: { state: CombatState; run: CombatRun; onConfirm: () => void }) {
  return (
    <>
      <span className="note">Pick up uses movement, Run costs the attack and Defense, Evasive costs the attack and rolls Speed, Leaving needs your confirmation. Declaring starts by itself once everyone has confirmed.</span>
      <button type="button" className="btn rust" disabled={run.busy || choosingNpcs(state).length === 0} onClick={onConfirm}>Confirm the NPCs&apos; movement</button>
    </>
  )
}

/** Moment 4 for the GM: everyone's choice, each NPC's choice to set, and every Leave to answer. */
function GmMovementList({ state, commands, onActFor }: MovementProps) {
  const [choices, setChoices] = useState<Record<string, string>>({})
  const run = useCombatRun()
  const confirmNpcs = () => run.run(() => commands.npcMovement(Object.fromEntries(choosingNpcs(state).map((npc) => [npc.key, npcPick(choices[npc.key] ?? 'stay')]))))
  const asking = state.combatants.filter((entry) => entry.movement?.leave === 'asked')
  return (
    <CombatWindow title="Movement" stepper={<PhaseStepper state={state} />} foot={<GmFoot state={state} run={run} onConfirm={confirmNpcs} />}>
      <CombatRefusal refusal={run.refusal} />
      <p className="ask">Players choose on their own screens. You choose for the NPCs.</p>
      <MovementRows state={state} choices={choices} onChoose={(key, value) => setChoices({ ...choices, [key]: value })} onActFor={onActFor} />
      <div className="leave-asks">{asking.map((combatant) => <LeaveAsk key={combatant.key} combatant={combatant} run={run} onAnswer={(confirm) => run.run(() => commands.answerLeave(combatant.key, confirm))} />)}</div>
      <MovementFloor state={state} />
    </CombatWindow>
  )
}

/** The player the GM is choosing for while they are away, until that choice is in. */
const actingFor = (state: CombatState, key: string | null): Combatant | undefined =>
  state.combatants.find((entry) => entry.key === key && entry.kind === 'character' && entry.outReason === null && !entry.movement)

export function GmMovement(props: MovementProps) {
  const away = actingFor(props.state, props.viewer.actingFor)
  if (!away) return <GmMovementList {...props} />
  return <MoveWindow key={away.key} state={props.state} combatant={away} sheet={movementSheetOf(away, props.roster)} commands={props.commands} named />
}
