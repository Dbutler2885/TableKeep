import type { CombatAttack, Combatant, CombatState } from '../engine/types'
import { isRoundAttack } from '../engine/roundAttacks'
import type { AttackGone } from './attackWindowModel'
import { combatantName } from './attackWords'
import type { SlotNotice } from './CombatParts'

type NoticeInputs = { state: CombatState; attacker: Combatant; attack: CombatAttack; gone: AttackGone; gm: boolean; reach: string | null; refusal: string | null }

const notice = (key: string, tone: SlotNotice['tone'], role: SlotNotice['role'], lead: string, rest = ''): SlotNotice =>
  ({ key, tone, role, body: <><b>{lead}</b>{rest ? ` ${rest}` : ''}</>, words: rest ? `${lead} ${rest}` : lead })

/**
 * Everything the attack window has to say, most pressing first: what the table refused, what has gone since the
 * attack was declared, a repair it waits on, the reach reminder, and why a Sneak Attack runs now.
 */
export function attackNotices({ state, attacker, attack, gone, gm, reach, refusal }: NoticeInputs): SlotNotice[] {
  const declared = isRoundAttack(state, attack)
  const notices: (SlotNotice | null)[] = [
    refusal ? notice('refusal', 'hot', 'alert', refusal) : null,
    declared && gone.target ? notice('target-gone', 'hot', 'status', `${combatantName(state, attack.aim!.targetKey)} is Out.`, 'Choose again.') : null,
    declared && gone.weapon ? notice('weapon-gone', 'hot', 'status', `The ${attack.frozen!.weaponName.toLowerCase()} is no longer in your hand.`, 'Choose again.') : null,
    attack.repair ? notice('repair', 'hot', 'alert', 'Waiting for a repair.', `${attack.repair} Nothing has been spent or rolled.`) : null,
    reach ? notice('reach', 'cool', 'status', reach) : null,
    declared ? null : notice('granted', 'cool', undefined, gm ? `${attacker.name} has a Sneak Attack.` : 'The GM granted you a Sneak Attack.'),
  ]
  return notices.filter((entry): entry is SlotNotice => entry !== null)
}
