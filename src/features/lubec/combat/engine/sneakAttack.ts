import { aimRequests, combatAimHandlers } from './attackAim'
import { combatantOf } from './attackParty'
import { combatRollHandlers } from './attackRoll'
import { requireGm, requireLiveContext } from './context'
import type { CombatAttack, CombatHandler, CombatState } from './types'

function requireGrantable(state: CombatState, key: unknown) {
  if (state.phase !== 'before-initiative') throw new Error('A Sneak Attack is granted only before initiative.')
  if (state.attack && !state.attack.closed) throw new Error('Finish the granted attack first.')
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

export const combatSneakAttackHandlers: Readonly<Record<string, CombatHandler>> = { grant, ...combatAimHandlers, ...combatRollHandlers }
