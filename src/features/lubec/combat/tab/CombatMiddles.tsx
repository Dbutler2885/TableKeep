import type { Combatant, CombatState } from '../engine/types'
import { combatPhaseView } from './combatPhases'
import { CombatStepper, CombatWindow } from './CombatParts'

/** The fight window's stepper for the fight's phase. */
export function PhaseStepper({ state }: { state: CombatState }) {
  const view = combatPhaseView(state)
  return <CombatStepper steps={view.steps} now={view.now} />
}

const NOT_YET = 'Not available in this build yet.'

/** Moment 2 for the GM: everyone not Out beside the Grant Sneak Attack button, and the way on to initiative. */
export function BeforeInitiativeGm({ state }: { state: CombatState }) {
  const inFight = state.combatants.filter((combatant: Combatant) => combatant.outReason === null)
  return (
    <CombatWindow
      title="Before initiative"
      stepper={<PhaseStepper state={state} />}
      foot={<><span className="note">Nobody is in the turn order yet.</span><button type="button" className="btn rust" disabled title={NOT_YET}>Begin Combat - Roll Initiative</button></>}
    >
      <p className="ask">Grant a Sneak Attack and that person's attack runs at once.</p>
      <ul className="roster">
        {inFight.map((combatant) => (
          <li key={combatant.key}>
            <span className="row-line">{combatant.name}<br /><small>{combatant.kind === 'npc' ? 'NPC' : 'Player'} · Speed {combatant.speed}</small></span>
            <button type="button" className="btn line small rowbtn" disabled title={NOT_YET}>Grant Sneak Attack</button>
          </li>
        ))}
      </ul>
    </CombatWindow>
  )
}

/** The middle for anyone the fight is not waiting on: who it waits on, with the rails still in view. */
export function CombatWaiting({ state }: { state: CombatState }) {
  return (
    <CombatWindow title="Waiting" stepper={<PhaseStepper state={state} />} foot={<span className="note">The turn order and the Floor stay in view on either side.</span>}>
      <div className="bigwait">
        <span className="label">Before initiative</span>
        <h3>The fight is waiting on the GM<span className="dots" /></h3>
        <p>The GM may grant a Sneak Attack before rolling initiative.</p>
      </div>
    </CombatWindow>
  )
}

