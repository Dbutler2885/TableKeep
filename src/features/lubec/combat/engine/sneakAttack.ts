import { aimRequests, combatAimHandlers } from './attackAim'
import { combatantOf } from './attackParty'
import { combatDefenseHandlers } from './attackDefense'
import { combatRollHandlers } from './attackRoll'
import { combatRowHandlers } from './attackRow'
import { combatWoundHandlers } from './attackWound'
import { requireGm, requireLiveContext } from './context'
import type { CombatAttack, CombatHandler, CombatState } from './types'

function requireNothingOpen(state: CombatState) {
  if (state.attack && !state.attack.closed) throw new Error('Finish the granted attack first.')
  if (state.woundOutbox.length) throw new Error('Wounds must reach the sheet first.')
}

function requireGrantable(state: CombatState, key: unknown) {
  if (state.phase !== 'before-initiative') throw new Error('A Sneak Attack is granted only before initiative.')
  requireNothingOpen(state)
  const attacker = combatantOf(state, String(key))
  if (attacker.outReason !== null) throw new Error(`${attacker.name} is Out.`)
  return attacker
}

/** Before initiative the GM grants one immediate attack; it resolves before another grant or initiative. */
const grant: CombatHandler = (command, records, authority, entropy) => {
  requireGm(authority)
  const fight = requireLiveContext(command, records, authority)
  const attacker = requireGrantable(fight.state, command.payload.combatantKey)
  const attack: CombatAttack = {
    id: entropy.id('attack', 0), grantId: entropy.id('grant', 0), attackerKey: attacker.key, step: 'aim',
    detached: [], closed: false, aim: null, frozen: null, range: null, roll: null, repair: null,
  }
  return {
    fight: { ...fight, state: { ...fight.state, attack, pendingActions: aimRequests(attack) } }, items: [],
    logs: [{ event: `The GM granted ${attacker.name} a Sneak Attack.`, actor: null }],
  }
}

/** Until it rolls, a granted attack can be called off: by the GM, or by whoever controls the attacker. */
const withdraw: CombatHandler = (command, records, authority) => {
  const fight = requireLiveContext(command, records, authority)
  const { state } = fight
  const attack = state.attack
  if (state.phase !== 'before-initiative' || !attack || attack.closed || attack.grantId === null) throw new Error('There is no Sneak Attack to cancel.')
  if (command.payload.attackId !== attack.id) throw new Error('That Sneak Attack has already ended.')
  if (attack.step !== 'aim') throw new Error('That Sneak Attack has already rolled.')
  const { actorKey } = command.envelope
  if (actorKey !== null && actorKey !== attack.attackerKey) throw new Error('Only the attacker or the GM can cancel that Sneak Attack.')
  const attacker = combatantOf(state, attack.attackerKey)
  const event = actorKey === null ? `The GM cancelled ${attacker.name}'s Sneak Attack.` : `${attacker.name} called off the Sneak Attack.`
  return { fight: { ...fight, state: { ...state, attack: null, pendingActions: [] } }, items: [], logs: [{ event, actor: actorKey }] }
}

export const combatSneakAttackHandlers: Readonly<Record<string, CombatHandler>> = { grant, withdraw, ...combatAimHandlers, ...combatRollHandlers, ...combatDefenseHandlers, ...combatWoundHandlers, ...combatRowHandlers }
