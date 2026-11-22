import { useState } from 'react'
import type { CombatAttack, CombatState } from '../engine/types'
import { combatantName } from './attackWords'
import { PhaseStepper } from './CombatMiddles'
import { CombatWindow } from './CombatParts'
import { Refusal } from './ResultSteps'
import type { StepControls } from './ResultSteps'
import { useAct } from './useAct'

// A declared split that a sheet change made too big for its Handle pool. The
// roll waits while its owner (the GM for an NPC) chooses a new Defense; the
// attack takes the rest. The weapon, the use and the target stay as declared.

type Repair = NonNullable<CombatAttack['splitRepair']>

const tens = (pool: number): number[] => Array.from({ length: Math.max(0, Math.ceil(pool / 10)) }, (_, index) => index * 10).filter((amount) => amount < pool)

function RepairChoice({ repair, controls, against }: { repair: Repair; controls: StepControls; against: string }) {
  const options = tens(repair.pool)
  const [defense, setDefense] = useState(options.at(-1) ?? 0)
  const act = useAct()
  return (
    <div className="split-repair-choice">
      <label>
        <span>Defense against {against}</span>
        <select value={defense} onChange={(event) => setDefense(Number(event.target.value))}>
          {options.map((amount) => <option key={amount} value={amount}>{amount}</option>)}
        </select>
      </label>
      <p className="split-repair-sum">Attack {repair.pool - defense} + Defense {defense} = {repair.pool}</p>
      <button type="button" className="btn rust" disabled={act.busy} onClick={() => act.run(() => controls.commands.repairSplit(repair.combatantKey, defense))}>Confirm split</button>
      <Refusal refusal={act.refusal} />
    </div>
  )
}

/** The repair the fight waits on: the changed pool for everyone, and the choice for whoever controls that combatant. */
export function SplitRepairPanel({ state, repair, controls }: { state: CombatState; repair: Repair; controls: StepControls }) {
  const name = combatantName(state, repair.combatantKey)
  const against = combatantName(state, repair.against)
  return (
    <CombatWindow title="Split repair" stepper={<PhaseStepper state={state} />}>
      <div className="notice hot" role="alert">
        <span><b>{name}&apos;s Handle pool fell from {repair.was} to {repair.pool}.</b> Choose the split again.</span>
      </div>
      {controls.owns(repair.combatantKey)
        ? <RepairChoice repair={repair} controls={controls} against={against} />
        : <p className="split-repair-wait">Waiting for {name}&apos;s new Defense<span className="dots" /></p>}
    </CombatWindow>
  )
}
