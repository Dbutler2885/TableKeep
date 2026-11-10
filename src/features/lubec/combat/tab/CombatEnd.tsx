import { useState } from 'react'
import type { CombatState } from '../engine/types'
import { combatFloorRows, endedFloor } from './combatFloorRows'
import { PhaseStepper } from './CombatMiddles'
import { CombatFloorIcon, CombatWindow } from './CombatParts'

type ConfirmProps = { state: CombatState; onEnd: () => Promise<string | null>; onCancel: () => void }

/** Moment 12 for the GM: who is Out and what is left on the Floor, before the only way a fight ends. */
export function CombatEndConfirm({ state, onEnd, onCancel }: ConfirmProps) {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const outs = state.combatants.filter((combatant) => combatant.outReason !== null)
  const rows = combatFloorRows(state.floor)
  const end = async () => {
    setBusy(true)
    setRefusal(await onEnd())
    setBusy(false)
  }
  return (
    <CombatWindow
      title="End combat"
      stepper={<PhaseStepper state={state} />}
      foot={<><span className="note">Rounds advance by themselves; only you end combat.</span><button type="button" className="btn line" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="btn rust" disabled={busy} onClick={() => void end()}>End combat</button></>}
    >
      {refusal ? <div className="notice hot" role="alert"><span><b>Combat is still running.</b> {refusal}</span></div> : null}
      <p className="ask">End combat?</p>
      <div className="two-col">
        <div>
          <span className="label">Who is Out</span>
          <ul className="roster spaced">{outs.length ? outs.map((combatant) => <li key={combatant.key}>{combatant.name}<small>Out</small></li>) : <li>Nobody</li>}</ul>
        </div>
        <div>
          <span className="label">Left on the Floor</span>
          <ul className="roster spaced">
            {rows.length ? rows.map((row) => <li key={row.key}><CombatFloorIcon item={row.item} small />{row.item.name}<small>×{row.count}</small></li>) : <li>Nothing</li>}
          </ul>
          <p className="note after">They go to your Items as dropped.</p>
        </div>
      </div>
    </CombatWindow>
  )
}

function EndedFloorWords({ state }: { state: CombatState }) {
  const { words, total } = endedFloor(state)
  if (!total) return <>Nothing was left on the Floor.</>
  return <>{words} from the Floor {total === 1 ? 'is' : 'are'} now in your Items as <b>dropped</b>.</>
}

/** The GM's last screen of a fight: it has ended, and where the Floor went. */
export function CombatEnded({ state }: { state: CombatState }) {
  return (
    <CombatWindow title="End combat" stepper={<PhaseStepper state={state} />} foot={<span className="note">The Combat tab is gone for players.</span>}>
      <div className="outcome safe"><h4>Combat ended</h4><p>Players were returned to their sheets. <EndedFloorWords state={state} /></p></div>
    </CombatWindow>
  )
}
