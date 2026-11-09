import { aimRequests } from './attackAim'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { combatAttackers } from './declare'
import { withMovementRequests } from './movement'
import type { CombatAttack, Combatant, CombatDefenseLine, CombatPlan, CombatState } from './types'

/** An attack of the round, as against a Sneak Attack granted before initiative. */
export const isRoundAttack = (state: CombatState, attack: CombatAttack): boolean => state.round > 0 && attack.grantId === null

const finished = (state: CombatState): CombatAttack | null => (state.attack?.closed ? state.attack : state.lastAttack ?? null)

/** The next attacker, fastest first, who has not had their turn this round. */
const nextAttacker = (state: CombatState): Combatant | undefined =>
  combatAttackers(state).find((entry) => !(state.attacked ?? []).includes(entry.key))

/** A declared attack opens on the attacker's turn with its frozen aim and split, waiting for the GM's range anew and the Roll. */
function opened(state: CombatState, attacker: Combatant, entropy: CombatEntropy): CombatState {
  const { aim, frozen } = attacker.declaration!
  const attack: CombatAttack = { id: entropy.id('round-attack', 0), grantId: null, attackerKey: attacker.key, step: 'aim', detached: [], closed: false, aim, frozen, range: null, roll: null, repair: null }
  return { ...state, attack, lastAttack: finished(state), attacked: [...(state.attacked ?? []), attacker.key], pendingActions: aimRequests(attack) }
}

const freshFighter = (entry: Combatant): Combatant => ({ ...entry, movement: null, declaration: null, proposedDeclaration: null, declarationRejected: false })

/** The round is over: the next one begins at Movement by itself, with the last result still in view. */
function nextRound(state: CombatState, entropy: CombatEntropy): CombatState {
  const round = state.round + 1
  return withMovementRequests({
    ...state, round, phase: 'movement', stageInstanceId: entropy.id('round-stage', 0), combatants: state.combatants.map(freshFighter),
    attack: null, lastAttack: finished(state), attacked: [], movementComplete: false,
  })
}

const turnLog = (attacker: Combatant): CombatLog => ({ event: `${attacker.name}'s turn to attack.`, actor: attacker.key })

/** A live fight in Attack with no attack open. */
const betweenAttacks = ({ fight }: CombatPlan): boolean =>
  fight.status === 'live' && fight.state.phase === 'attack' && (!fight.state.attack || fight.state.attack.closed)

/** After any command: during Attack with nothing open, the next attacker's turn opens, or the next round begins. */
export function withRoundFlow(plan: CombatPlan, entropy: CombatEntropy): CombatPlan {
  if (!betweenAttacks(plan)) return plan
  const { state } = plan.fight
  const attacker = nextAttacker(state)
  if (attacker) return { ...plan, fight: { ...plan.fight, state: opened(state, attacker, entropy) }, logs: [...plan.logs, turnLog(attacker)] }
  const next = nextRound(state, entropy)
  return { ...plan, fight: { ...plan.fight, state: next }, logs: [...plan.logs, { event: `Round ${next.round}, Movement.`, actor: null }] }
}

/** In a round, the target's declared line against this attacker, if it still stands: what Defense rolls with, or nothing to roll. */
export function declaredLine(state: CombatState, attack: CombatAttack): (CombatDefenseLine & { full: boolean }) | null {
  // Everyone in the fight during Attack has a declaration: made, Ran, or the empty one a Return gives.
  const declaration = state.combatants.find((entry) => entry.key === attack.aim!.targetKey)!.declaration!
  const line = declaration.stopped ? undefined : declaration.lines.find((entry) => entry.against === attack.attackerKey)
  return line ? { ...line, full: declaration.full } : null
}
