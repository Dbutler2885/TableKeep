import { useState } from 'react'
import type { Combatant, CombatState } from '../engine/types'
import { beginBlocked, combatPhaseView } from './combatPhases'
import { CombatStepper, CombatWindow } from './CombatParts'

/** The fight window's stepper for the fight's phase. */
export function PhaseStepper({ state }: { state: CombatState }) {
  const view = combatPhaseView(state)
  return <CombatStepper steps={view.steps} now={view.now} />
}

type GrantRowProps = { combatant: Combatant; running: boolean; open: boolean; busy: boolean; onGrant: (key: string) => void }

function GrantRow({ combatant, running, open, busy, onGrant }: GrantRowProps) {
  return (
    <li>
      <span className="row-line">{combatant.name}<br /><small>{combatant.kind === 'npc' ? 'NPC' : 'Player'} · Speed {combatant.speed}</small></span>
      {running ? <span className="badge must">Attack running on their screen</span> : null}
      <button type="button" className="btn line small rowbtn" disabled={open || busy} onClick={() => onGrant(combatant.key)}>Grant Sneak Attack</button>
    </li>
  )
}

type BeforeProps = { state: CombatState; onGrant: (key: string) => Promise<string | null>; onBegin: () => Promise<string | null> }

function BeginButton({ state, onBegin, busy, run }: { state: CombatState; onBegin: () => Promise<string | null>; busy: boolean; run: (act: () => Promise<string | null>) => void }) {
  const blocked = beginBlocked(state)
  return <button type="button" className="btn rust" disabled={busy || blocked !== null} title={blocked ?? undefined} onClick={() => run(onBegin)}>Begin Combat - Roll Initiative</button>
}

/** Moment 2 for the GM: everyone not Out beside the Grant Sneak Attack button, one grant at a time, and the way on to initiative. */
export function BeforeInitiativeGm({ state, onGrant, onBegin }: BeforeProps) {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const inFight = state.combatants.filter((combatant: Combatant) => combatant.outReason === null)
  const open = state.attack !== null && !state.attack.closed
  const run = async (act: () => Promise<string | null>) => {
    setBusy(true)
    setRefusal(await act())
    setBusy(false)
  }
  const grant = (key: string) => run(() => onGrant(key))
  return (
    <CombatWindow
      title="Before initiative"
      stepper={<PhaseStepper state={state} />}
      foot={<><span className="note">Nobody is in the turn order yet.</span><BeginButton state={state} onBegin={onBegin} busy={busy} run={(act) => void run(act)} /></>}
    >
      {refusal ? <div className="notice hot" role="alert"><span>{refusal}</span></div> : null}
      <p className="ask">Grant a Sneak Attack and that person&apos;s attack runs at once.</p>
      <ul className="roster">
        {inFight.map((combatant) => <GrantRow key={combatant.key} combatant={combatant} running={open && state.attack?.attackerKey === combatant.key} open={open} busy={busy} onGrant={(key) => void grant(key)} />)}
      </ul>
    </CombatWindow>
  )
}

/** Before initiative, for anyone the fight is not waiting on: the GM's grants, with the rails still in view. */
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
