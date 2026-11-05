import type { LubecHands } from '../../../ruleSets/lubec/gear/held'
import type { Combatant, CombatState } from '../engine/types'
import type { AttackCommands } from './attackCommands'
import { controlsAttacker, type CombatViewer } from './attackWords'
import type { CombatRosterRecords } from './combatFightCombatants'
import type { StepControls } from './ResultSteps'

export type MiddleProps = {
  state: CombatState
  fightId: string
  viewer: CombatViewer
  roster: CombatRosterRecords
  commands: AttackCommands
  onActFor: (key: string) => void
  onInventory: (attacker: Combatant, hands: LubecHands) => void
}

/** The result sequence's controls for this viewer: the steps of the combatants they control. */
export const stepControls = ({ state, viewer, commands, onActFor, roster, fightId }: MiddleProps): StepControls => ({
  owns: (key) => controlsAttacker(state.combatants.find((entry) => entry.key === key)!, viewer),
  isGm: viewer.role === 'gm', commands, onActFor, roster, fightId,
})

