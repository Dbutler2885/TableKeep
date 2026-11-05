import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import type { CombatAttack, CombatState } from '../engine/types'
import { combatantName, isThrow, missWords } from './attackWords'
import { tableName } from './resultSequence'

type Words = { attacker: string; target: string; item: string; thrown: boolean; out: boolean; attack: CombatAttack }
type Banner = { tone: string; title: string; text: string }

const lands = (words: Words) => (words.thrown ? ` The ${words.item} lands on the Floor.` : '')

/** The mock-up's endBanner for each way an attack closes. */
const BANNERS: Readonly<Record<string, (words: Words) => Banner>> = {
  miss: (w) => ({ tone: '', title: 'A miss', text: missWords(w.attacker, w.attack.frozen!) }),
  dodged: (w) => ({ tone: 'safe', title: 'Dodged', text: `${w.target} stops it.${lands(w)} ${w.attacker} is not Out.` }),
  dropped: (w) => ({ tone: 'safe', title: 'Dodged', text: `${w.target} could not hold it, but the throw is still a dodge. The ${w.item} lands on the Floor and ${w.attacker} is not Out.` }),
  caught: (w) => (w.out
    ? { tone: 'out', title: `Caught: ${w.attacker} is Out`, text: `The ${w.item} goes to ${w.target}'s hand. Catching it puts the thrower out, so ${w.attacker} is Out.` }
    : { tone: 'safe', title: 'Caught', text: `The ${w.item} goes to ${w.target}'s hand.` }),
  'no-wound': (w) => ({ tone: '', title: 'No effect', text: `The hit did nothing.${lands(w)}` }),
  manual: (w) => ({ tone: '', title: 'The GM records this wound', text: `${tableName(w.attack.impact!.table)} table, ${locName(w.attack.landing!.part!).toLowerCase()}, Impact ${w.attack.impact!.total}.${lands(w)}` }),
}

function wordsOf(state: CombatState, attack: CombatAttack): Words {
  const attacker = state.combatants.find((entry) => entry.key === attack.attackerKey)!
  return {
    attacker: attacker.name, target: combatantName(state, attack.aim!.targetKey), item: attack.frozen!.weaponName.toLowerCase(),
    thrown: isThrow(attack.frozen!), out: attacker.outReason === 'caught', attack,
  }
}

/** How a closed attack ended; a Dodgeball wound waiting on its table has no banner yet. */
export function OutcomeBanner({ state, attack }: { state: CombatState; attack: CombatAttack }) {
  const banner = BANNERS[attack.outcome ?? '']?.(wordsOf(state, attack))
  if (!banner) return null
  return <div className={`outcome ${banner.tone}`.trim()}><h4>{banner.title}</h4><p>{banner.text}</p></div>
}
