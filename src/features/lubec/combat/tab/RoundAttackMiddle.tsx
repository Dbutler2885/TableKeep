import type { ReactNode } from 'react'
import { combatAttackers } from '../engine/declare'
import type { CombatAttack, Combatant, CombatState } from '../engine/types'
import { AttackResult } from './AttackResult'
import { AttackMatchup } from './AttackMatchup'
import { AttackGmWaiting } from './AttackWaiting'
import { OutcomeBanner } from './OutcomeBanner'
import { combatantName, controlsAttacker, waitsOnGm, type CombatViewer } from './attackWords'
import { PhaseStepper } from './CombatMiddles'
import { CombatWindow } from './CombatParts'
import { OwnDeclarations } from './DeclareMiddle'
import { viewerKeys } from './declarationsModel'
import { SneakAttackWindow } from './SneakAttackWindow'
import { stepControls, type MiddleProps } from './stepControls'

/** Who attacks after the one whose turn it is. */
const nextUp = (state: CombatState, attack: CombatAttack): Combatant | undefined =>
  combatAttackers(state).find((entry) => entry.key !== attack.attackerKey && !state.attacked!.includes(entry.key))

/** "Dottie Haskell is about to throw at Tommy Lyle. You are next." */
function aboutWords(state: CombatState, attack: CombatAttack, attacker: Combatant, viewer: CombatViewer): string {
  const about = `${attacker.name} is about to ${attack.frozen!.choice.name.toLowerCase()} at ${combatantName(state, attack.aim!.targetKey)}.`
  const next = nextUp(state, attack)
  return next && viewerKeys(state, viewer).includes(next.key) ? `${about} You are next.` : about
}

type WaitProps = { state: CombatState; attack: CombatAttack; attacker: Combatant; viewer: CombatViewer }

/** Moment 6 during Attack: who the fight waits on, with this viewer's own declaration in view. */
function AttackTurnWaiting({ state, attack, attacker, viewer }: WaitProps) {
  return (
    <CombatWindow title="Waiting" stepper={<PhaseStepper state={state} />} foot={<span className="note">Declarations and the Floor stay in view on either side.</span>}>
      <AttackMatchup attacker={attacker.name} target={combatantName(state, attack.aim!.targetKey)} />
      <div className="bigwait">
        <span className="label">Stage 3, Attack, fastest first</span>
        <h3>The fight is waiting on {waitsOnGm(attack) ? 'the GM' : attacker.name}<span className="dots" /></h3>
        <p>{aboutWords(state, attack, attacker, viewer)}</p>
      </div>
      <OwnDeclarations state={state} viewer={viewer} />
    </CombatWindow>
  )
}

/** The attack whose turn it is: its window for whoever controls it, the GM's range and wait, or a wait; past the Roll, its result. */
function OpenAttack({ attack, ...props }: MiddleProps & { attack: CombatAttack }) {
  const { state, viewer, commands } = props
  if (attack.step !== 'aim') return <AttackResult state={state} attack={attack} controls={stepControls(props)} />
  const attacker = state.combatants.find((entry) => entry.key === attack.attackerKey)!
  if (controlsAttacker(attacker, viewer)) {
    return <SneakAttackWindow state={state} fightId={props.fightId} attack={attack} attacker={attacker} roster={props.roster} commands={commands} gm={viewer.role === 'gm'} onInventory={(hands) => props.onInventory(attacker, hands)} />
  }
  if (viewer.role === 'gm') return <AttackGmWaiting state={state} attack={attack} attacker={attacker} onRange={(band, modifier) => void commands.range(band, modifier)} onActFor={() => props.onActFor(attacker.key)} />
  return <AttackTurnWaiting state={state} attack={attack} attacker={attacker} viewer={viewer} />
}

/**
 * When the next turn or round opens, the finished result gives way to it: only its outcome banner stays above,
 * so one main panel shows at a time and the turn order and the rail show the rest.
 */
export function LastResult({ state }: { state: CombatState }): ReactNode {
  return state.lastAttack ? <div className="last-outcome"><OutcomeBanner state={state} attack={state.lastAttack} /></div> : null
}

/** Moments 6 to 10 in a round: the last result, then the attack whose turn it is. */
export function RoundAttackMiddle(props: MiddleProps) {
  // During Attack the engine always opens the next turn, or begins the next round, after every command.
  const attack = props.state.attack!
  return (
    <>
      <LastResult state={props.state} />
      <OpenAttack {...props} attack={attack} />
    </>
  )
}
