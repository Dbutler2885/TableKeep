import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import type { CombatAttack, CombatState } from '../engine/types'
import { isThrow, missWords } from './attackWords'
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
  wounded: (w) => ({ tone: 'out', title: woundedTitle(w), text: `${w.attack.row!.name}: ${w.attack.rowOutcome}${lands(w)}` }),
  'row-caught': (w) => ({ tone: 'out', title: `Caught it: ${w.attacker} is Out`, text: `${w.attack.row!.name}: ${w.target} holds on and stays in, and ${w.attacker} is Out instead.` }),
  manual: (w) => ({ tone: '', title: 'The GM records this wound', text: `${tableName(w.attack.impact!.table)} table, ${locName(w.attack.landing!.part!).toLowerCase()}, Impact ${w.attack.impact!.total}.${lands(w)}` }),
}

/** "Roy Carver is Out", or both names when a Headshot puts the thrower out too. */
// Every row a wound comes from puts the target Out; only a catch keeps them in, and that ends as row-caught.
const woundedTitle = (w: Words): string => (w.out ? `${w.target} and ${w.attacker} are Out` : `${w.target} is Out`)

function wordsOf(state: CombatState, attack: CombatAttack): Words {
  const attacker = state.combatants.find((entry) => entry.key === attack.attackerKey)!
  const target = state.combatants.find((entry) => entry.key === attack.aim!.targetKey)!
  return {
    attacker: attacker.name, target: target.name, item: attack.frozen!.weaponName.toLowerCase(),
    thrown: isThrow(attack.frozen!), out: attacker.outReason !== null, attack,
  }
}

/** How a closed attack ended; a Dodgeball wound waiting on its table has no banner yet. */
export function OutcomeBanner({ state, attack }: { state: CombatState; attack: CombatAttack }) {
  const banner = BANNERS[attack.outcome ?? '']?.(wordsOf(state, attack))
  if (!banner) return null
  return <div className={`outcome ${banner.tone}`.trim()}><h4>{banner.title}</h4><p>{banner.text}</p></div>
}
