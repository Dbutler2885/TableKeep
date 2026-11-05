import { useState } from 'react'
import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import type { Combatant, CombatMovementChoice, CombatState } from '../engine/types'
import type { AttackCommands, MovementPick } from './attackCommands'
import type { CombatViewer } from './attackWords'
import type { CombatRosterRecords } from './combatFightCombatants'
import { pickupBlocked } from './movementModel'
import { combatCatchLine, combatFloorRows, type CombatFloorRow } from './combatFloorRows'
import { PhaseStepper } from './CombatMiddles'
import { CombatFloorIcon, CombatWindow } from './CombatParts'
import { CombatRefusal } from './CombatParts'
import { useCombatRun, type CombatRun } from './useCombatRun'

/** Each choice's name and what it costs. Run's words follow the settled rule: it costs the attack and Defense. */
const CHOICES: readonly (readonly [CombatMovementChoice, string, string])[] = [
  ['stay', 'Move or stay', 'Nothing to choose. The GM describes where everyone is in words; it is not tracked.'],
  ['run', 'Run', 'Costs your attack and your Defense this round.'],
  ['pickup', 'Pick up', 'Uses your movement.'],
  ['leave', 'Leave the fight', 'You go Out once the GM confirms you can get away.'],
]

const FloorWords = ({ row, count }: { row: CombatFloorRow; count: number }) => {
  const line = combatCatchLine(row.item)
  return <span className="row-line">{row.item.name} ×{count}{line ? <><br /><small>{line}</small></> : null}</span>
}

type PickRowProps = { row: CombatFloorRow; picked: boolean; live: boolean; blocked: string | null; onPick: () => void }

function PickRow({ row, picked, live, blocked, onPick }: PickRowProps) {
  return (
    <li>
      <CombatFloorIcon item={row.item} small />
      <FloorWords row={row} count={row.count - (picked ? 1 : 0)} />
      <button type="button" className="btn rust small rowbtn" disabled={!live || blocked !== null} title={blocked ?? undefined} onClick={onPick}>{picked ? 'Picked up' : 'Pick up'}</button>
    </li>
  )
}

/** The Floor, right here, as a plain list for whoever does not pick from it. */
export function MovementFloor({ state }: { state: CombatState }) {
  const rows = combatFloorRows(state.floor)
  return (
    <>
      <span className="label block">On the Floor</span>
      <ul className="roster spaced">
        {rows.map((row) => <li key={row.key}><CombatFloorIcon item={row.item} small /><FloorWords row={row} count={row.count} /></li>)}
        {rows.length ? null : <li>Nothing on the Floor.</li>}
      </ul>
    </>
  )
}

type Draft = { choice: CombatMovementChoice; picked: string | null }

const rowOfRecord = (state: CombatState, recordId: string | null): CombatFloorRow | undefined =>
  combatFloorRows(state.floor).find((row) => recordId !== null && row.recordIds.includes(recordId))

/** The claim a draft makes: the first backing record of the picked row, one of it. */
const pickOf = (draft: Draft): MovementPick => ({ choice: draft.choice, pickup: draft.choice === 'pickup' ? { itemId: draft.picked!, qty: 1 } : null })

const canConfirm = (draft: Draft): boolean => draft.choice !== 'pickup' || draft.picked !== null

function confirmedNote(combatant: Combatant): string {
  if (combatant.movement?.leave === 'asked') return 'Waiting for the GM to say whether you can get away.'
  return 'Waiting for everyone to confirm. Declaring starts by itself when they have.'
}

type FootProps = { combatant: Combatant; draft: Draft; run: CombatRun; onConfirm: () => void }

function MoveFoot({ combatant, draft, run, onConfirm }: FootProps) {
  if (combatant.movement) return <span className="note">{confirmedNote(combatant)}</span>
  const note = draft.choice === 'pickup' && !draft.picked ? 'Choose what to pick up from the Floor.' : 'Pick one, then confirm.'
  return <><span className="note">{note}</span><button type="button" className="btn rust" disabled={run.busy || !canConfirm(draft)} onClick={onConfirm}>Confirm movement</button></>
}

export type MovementProps = { state: CombatState; viewer: CombatViewer; roster: CombatRosterRecords; commands: AttackCommands; onActFor: (key: string) => void }

export type MoveProps = { state: CombatState; combatant: Combatant; sheet: LubecCharacterSheet | null; commands: AttackCommands; named: boolean }

function MoveCards({ shown, live, onChoose }: { shown: Draft; live: boolean; onChoose: (choice: CombatMovementChoice) => void }) {
  return (
    <div className="moves" role="radiogroup" aria-label="Movement">
      {CHOICES.map(([choice, name, words]) => (
        <button key={choice} type="button" className="mode" role="radio" aria-checked={shown.choice === choice} disabled={!live} onClick={() => onChoose(choice)}><b>{name}</b><small>{words}</small></button>
      ))}
    </div>
  )
}

const askWords = (combatant: Combatant, named: boolean): string => {
  if (combatant.movement) return 'Movement is set.'
  return named ? `${combatant.name}: what do you do this round?` : 'What do you do this round?'
}

type FloorPickProps = { state: CombatState; shown: Draft; draft: Draft; live: boolean; sheet: LubecCharacterSheet | null; onDraft: (draft: Draft) => void }

/** The Floor with a Pick up button on each row, live while Pick up waits for its pick. */
function FloorPicks({ state, shown, draft, live, sheet, onDraft }: FloorPickProps) {
  const pickedRow = rowOfRecord(state, shown.picked)
  const rows = combatFloorRows(state.floor)
  const picking = live && draft.choice === 'pickup' && !draft.picked
  return (
    <ul className="roster spaced">
      {rows.map((row) => <PickRow key={row.key} row={row} picked={row.key === pickedRow?.key} live={picking} blocked={pickupBlocked(sheet, row)} onPick={() => onDraft({ ...draft, picked: row.recordIds[0] })} />)}
      {rows.length ? null : <li>Nothing on the Floor.</li>}
    </ul>
  )
}

/** The confirmed choice once it is in, else the draft. */
const shownChoice = (combatant: Combatant, draft: Draft): Draft =>
  (combatant.movement ? { choice: combatant.movement.choice, picked: combatant.movement.pickup?.itemId ?? null } : draft)

/** Moment 4 for one combatant this viewer moves: the four cards, the Floor with its Pick up buttons, and Confirm. */
export function MoveWindow({ state, combatant, sheet, commands, named }: MoveProps) {
  const [draft, setDraft] = useState<Draft>({ choice: 'stay', picked: null })
  const run = useCombatRun()
  const live = !combatant.movement
  const shown = shownChoice(combatant, draft)
  return (
    <CombatWindow title="Movement" stepper={<PhaseStepper state={state} />} foot={<MoveFoot combatant={combatant} draft={draft} run={run} onConfirm={() => run.run(() => commands.move(combatant.key, pickOf(draft)))} />}>
      <CombatRefusal refusal={run.refusal} />
      <p className="ask">{askWords(combatant, named)}</p>
      <MoveCards shown={shown} live={live} onChoose={(choice) => setDraft({ choice, picked: null })} />
      <span className="label">On the Floor</span>
      <FloorPicks state={state} shown={shown} draft={draft} live={live} sheet={sheet} onDraft={setDraft} />
    </CombatWindow>
  )
}
