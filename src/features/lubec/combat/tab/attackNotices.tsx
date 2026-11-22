import type { CombatAttack, Combatant, CombatState } from '../engine/types'
import { isRoundAttack } from '../engine/roundAttacks'
import type { AttackGone } from './attackWindowModel'
import { combatantName } from './attackWords'
import type { SlotNotice } from './CombatParts'

type NoticeInputs = { state: CombatState; attacker: Combatant; attack: CombatAttack; gone: AttackGone; gm: boolean; reach: string | null; refusal: string | null }

const notice = (key: string, tone: SlotNotice['tone'], role: SlotNotice['role'], lead: string, rest = ''): SlotNotice =>
  ({ key, tone, role, body: <><b>{lead}</b>{rest ? ` ${rest}` : ''}</>, words: rest ? `${lead} ${rest}` : lead })

type Context = NoticeInputs & { declared: boolean }
type Rule = { when: (context: Context) => boolean; make: (context: Context) => SlotNotice }

const grantWords = ({ gm, attacker }: Context) => (gm ? `${attacker.name} has a Sneak Attack.` : 'The GM granted you a Sneak Attack.')

/** Most pressing first: what the table refused, what has gone since Declare, a repair, the reach reminder, the grant. */
const RULES: readonly Rule[] = [
  { when: (c) => Boolean(c.refusal), make: (c) => notice('refusal', 'hot', 'alert', c.refusal!) },
  { when: (c) => c.declared && c.gone.target, make: (c) => notice('target-gone', 'hot', 'status', `${combatantName(c.state, c.attack.aim!.targetKey)} is Out.`, 'Choose again.') },
  { when: (c) => c.declared && c.gone.weapon, make: (c) => notice('weapon-gone', 'hot', 'status', `The ${c.attack.frozen!.weaponName.toLowerCase()} is no longer in your hand.`, 'Choose again.') },
  { when: (c) => Boolean(c.attack.repair), make: (c) => notice('repair', 'hot', 'alert', 'Waiting for a repair.', `${c.attack.repair} Nothing has been spent or rolled.`) },
  { when: (c) => Boolean(c.reach), make: (c) => notice('reach', 'cool', 'status', c.reach!) },
  { when: (c) => !c.declared, make: (c) => notice('granted', 'cool', undefined, grantWords(c)) },
]

/**
 * Everything the attack window has to say, most pressing first: what the table refused, what has gone since the
 * attack was declared, a repair it waits on, the reach reminder, and why a Sneak Attack runs now.
 */
export function attackNotices(inputs: NoticeInputs): SlotNotice[] {
  const context = { ...inputs, declared: isRoundAttack(inputs.state, inputs.attack) }
  return RULES.filter((rule) => rule.when(context)).map((rule) => rule.make(context))
}
