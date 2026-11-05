import type { CombatAttack, Combatant, CombatState } from '../engine/types'
import { PhaseStepper } from './CombatMiddles'
import { CombatWindow } from './CombatParts'
import { RangeRow, type DeclareRange } from './RangeRow'
import { attackLine, waitsOnGm } from './attackWords'

type GmWaitProps = { state: CombatState; attack: CombatAttack; attacker: Combatant; onRange: DeclareRange; onActFor: () => void }

/** Moment 6 for the GM: who the grant waits on, the range row live, and the way to act for an absent player. */
function RepairWords({ repair }: { repair: string | null | undefined }) {
  return repair ? <p><b>Waiting for a repair.</b> {repair}</p> : null
}

function GmRange({ state, attack, attacker, onRange }: Omit<GmWaitProps, 'onActFor'>) {
  if (attack.frozen?.choice.ranged !== true) return null
  return <RangeRow attack={attack} remembered={state.lastRanges?.[attacker.key]} onDeclare={onRange} />
}

const gmHeading = (attack: CombatAttack, attacker: Combatant): string => (waitsOnGm(attack) ? 'Declare the range' : `Waiting on ${attacker.name} to roll`)

export function AttackGmWaiting({ state, attack, attacker, onRange, onActFor }: GmWaitProps) {
  return (
    <CombatWindow title="Attack" stepper={<PhaseStepper state={state} />} foot={<span className="note">Their roll lands on every screen as a card, then settles into the ticker.</span>}>
      <div className="bigwait">
        <span className="label">{state.round ? 'Stage 3, Attack, fastest first' : 'Before initiative · Sneak Attack'}</span>
        <h3>{gmHeading(attack, attacker)}<span className="dots" /></h3>
        <p>{attackLine(state, attack)}</p>
        <RepairWords repair={attack.repair} />
        <p className="note"><button type="button" className="linkish" onClick={onActFor}>Away from the table? Roll for {attacker.name}</button></p>
      </div>
      <GmRange state={state} attack={attack} attacker={attacker} onRange={onRange} />
    </CombatWindow>
  )
}

/** Moment 6 for everyone else: who the fight is waiting on during a grant. */
export function AttackWaiting({ state, attack, attacker }: { state: CombatState; attack: CombatAttack; attacker: Combatant }) {
  const who = waitsOnGm(attack) ? 'the GM' : attacker.name
  return (
    <CombatWindow title="Waiting" stepper={<PhaseStepper state={state} />} foot={<span className="note">The turn order and the Floor stay in view on either side.</span>}>
      <div className="bigwait">
        <span className="label">Before initiative</span>
        <h3>The fight is waiting on {who}<span className="dots" /></h3>
        <p>{attacker.name} has a Sneak Attack. {attackLine(state, attack)}</p>
      </div>
    </CombatWindow>
  )
}
