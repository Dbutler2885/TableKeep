import { allUnconscious } from '../engine/stages'
import { useCombatRun } from './useCombatRun'
import type { Combatant, CombatState } from '../engine/types'
import { controlsAttacker } from './attackWords'
import { PhaseStepper } from './CombatMiddles'
import { CombatWindow } from './CombatParts'
import { GmMovement } from './GmMovement'
import { movementSheetOf } from './movementModel'
import { MoveWindow, type MovementProps } from './MovementParts'

const inFight = (state: CombatState) => state.combatants.filter((entry) => entry.outReason === null)

/** Everyone's choices are in: the stage waits only for the GM's workspace to settle it. */
function SettleWaiting({ state, commands, viewer }: MovementProps) {
  const run = useCombatRun()
  const asleep = allUnconscious(state)
  if (asleep) {
    const advance = viewer.role === 'gm'
      ? <button type="button" className="btn rust" disabled={run.busy || !commands.settleMovement} onClick={() => run.run(() => commands.settleMovement!())}>Advance skipped round</button>
      : <span className="note">The GM advances the round.</span>
    return (
      <CombatWindow title="Movement" stepper={<PhaseStepper state={state} />} foot={advance}>
        <div className="bigwait">
          <h3>{state.combatants.some((entry) => entry.condition) ? 'Everyone’s stages are skipped' : 'Everyone is unconscious'}</h3>
          <p>Unresolved stages are skipped. The GM can advance a round to process countdowns or end combat.</p>
          {run.refusal ? <p role="alert">{run.refusal}</p> : null}
        </div>
      </CombatWindow>
    )
  }
  return (
    <CombatWindow title="Movement" stepper={<PhaseStepper state={state} />} foot={<span className="note">Declaring starts by itself once Movement is settled.</span>}>
      <div className="bigwait">
        <span className="label">Round {state.round} · Stage 1 · Movement</span>
        <h3>Waiting for the GM to settle Movement<span className="dots" /></h3>
        <p>Everyone has confirmed. Pickups go to the fastest first.</p>
      </div>
    </CombatWindow>
  )
}

/** Moment 4 for anyone with nothing to choose: who Movement still waits on, without saying what anyone chose. */
function MovementWaiting({ state }: { state: CombatState }) {
  const waiting = inFight(state).filter((entry) => !entry.movement).map((entry) => entry.name)
  return (
    <CombatWindow title="Movement" stepper={<PhaseStepper state={state} />} foot={<span className="note">Choices stay private until the stage closes.</span>}>
      <div className="bigwait">
        <span className="label">Round {state.round} · Stage 1 · Movement</span>
        <h3>Waiting for everyone to confirm<span className="dots" /></h3>
        <p>{waiting.length ? `Still choosing: ${waiting.join(', ')}.` : 'The GM is answering a Leave.'}</p>
      </div>
    </CombatWindow>
  )
}


/** The player's own combatants still in the fight, each in its own window. */
function PlayerMovement({ owned, ...props }: MovementProps & { owned: Combatant[] }) {
  return <>{owned.map((combatant) => <MoveWindow key={`${props.state.stageInstanceId}:${combatant.key}`} state={props.state} combatant={combatant} sheet={movementSheetOf(combatant, props.roster)} commands={props.commands} named={owned.length > 1} />)}</>
}

/** Moment 4: the viewer's own choices, the GM's list, or a wait. */
export function MovementMiddle(props: MovementProps) {
  const { state, viewer } = props
  if (state.movementComplete) return <SettleWaiting {...props} />
  if (viewer.role === 'gm') return <GmMovement {...props} />
  const owned = inFight(state).filter((entry) => entry.kind === 'character' && controlsAttacker(entry, viewer))
  return owned.length ? <PlayerMovement {...props} owned={owned} /> : <MovementWaiting state={state} />
}
