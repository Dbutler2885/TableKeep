import type { ReactNode } from 'react'
import type { LubecHands } from '../../../ruleSets/lubec/gear/held'
import type { CombatAttack, Combatant, CombatState } from '../engine/types'
import type { AttackCommands } from './attackCommands'
import { AttackResult } from './AttackResult'
import { AttackGmWaiting, AttackWaiting } from './AttackWaiting'
import { controlsAttacker, type CombatViewer } from './attackWords'
import type { CombatRosterRecords } from './combatFightCombatants'
import { BeforeInitiativeGm, CombatWaiting } from './CombatMiddles'
import type { StepControls } from './ResultSteps'
import { SneakAttackWindow } from './SneakAttackWindow'

type MiddleProps = {
  state: CombatState
  fightId: string
  viewer: CombatViewer
  roster: CombatRosterRecords
  commands: AttackCommands
  onActFor: (key: string) => void
  onInventory: (attacker: Combatant, hands: LubecHands) => void
}

/** The result sequence's controls for this viewer: the steps of the combatants they control. */
const stepControls = ({ state, viewer, commands, onActFor, roster, fightId }: MiddleProps): StepControls => ({
  owns: (key) => controlsAttacker(state.combatants.find((entry) => entry.key === key)!, viewer),
  isGm: viewer.role === 'gm', commands, onActFor, roster, fightId,
})

const openAttack = (state: CombatState): CombatAttack | null => (state.attack && !state.attack.closed ? state.attack : null)

/** The middle while a granted attack waits at aim: the window for whoever controls it, a wait for everyone else. */
function AimMiddle({ attack, attacker, ...props }: MiddleProps & { attack: CombatAttack; attacker: Combatant }) {
  const { state, viewer, commands } = props
  if (controlsAttacker(attacker, viewer)) {
    return <SneakAttackWindow state={state} fightId={props.fightId} attack={attack} attacker={attacker} roster={props.roster} commands={commands} gm={viewer.role === 'gm'} onInventory={(hands) => props.onInventory(attacker, hands)} />
  }
  if (viewer.role === 'gm') {
    // Moment 2 stays in view, its badge on the attacker, above who the grant waits on.
    return (
      <>
        <BeforeInitiativeGm state={state} onGrant={commands.grant} />
        <AttackGmWaiting state={state} attack={attack} attacker={attacker} onRange={(band, modifier) => void commands.range(band, modifier)} onActFor={() => props.onActFor(attacker.key)} />
      </>
    )
  }
  return <AttackWaiting state={state} attack={attack} attacker={attacker} />
}

function MainMiddle(props: MiddleProps) {
  const { state, viewer } = props
  const attack = openAttack(state)
  if (attack?.step === 'aim') return <AimMiddle {...props} attack={attack} attacker={state.combatants.find((entry) => entry.key === attack.attackerKey)!} />
  if (attack) return <AttackResult state={state} attack={attack} controls={stepControls(props)} />
  return viewer.role === 'gm' ? <BeforeInitiativeGm state={state} onGrant={props.commands.grant} /> : <CombatWaiting state={state} />
}

/** Moment 2 with its grants: the last finished attack's result stays in view above the next choice. */
export function BeforeInitiativeMiddle(props: MiddleProps): ReactNode {
  const finished = props.state.attack?.closed ? props.state.attack : null
  return (
    <>
      {finished ? <AttackResult state={props.state} attack={finished} /> : null}
      <MainMiddle {...props} />
    </>
  )
}
