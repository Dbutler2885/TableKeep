import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import type { CombatAttack, CombatState } from '../engine/types'
import { isThrow, missWords } from './attackWords'
import { tableName } from './resultSequence'

type Words = { attacker: string; target: string; item: string; thrown: boolean; out: boolean; targetOut: boolean; attack: CombatAttack }
/** `aside` is what the Results card says under its headline when the wound panel already gives the wound's words. */
export type Banner = { tone: string; title: string; text: string; aside?: string }

const lands = (words: Words) => (words.thrown ? ` The ${words.item} lands on the Floor.` : '')

/** The mock-up's endBanner for each way an attack closes: the outcome banner's and the Results card's words. */
const BANNERS: Readonly<Record<string, (words: Words) => Banner>> = {
  miss: (w) => ({ tone: '', title: 'A miss', text: missWords(w.attacker, w.attack.frozen!) }),
  dodged: (w) => ({ tone: 'safe', title: 'Dodged', text: `${w.target} stops it.${lands(w)} ${w.attacker} is not Out.` }),
  dropped: (w) => ({ tone: 'safe', title: 'Dodged', text: `${w.target} could not hold it, but the throw is still a dodge. The ${w.item} lands on the Floor and ${w.attacker} is not Out.` }),
  caught: (w) => (w.out
    ? { tone: 'out', title: `Caught: ${w.attacker} is Out`, text: `The ${w.item} goes to ${w.target}'s hand. Catching it puts the thrower out, so ${w.attacker} is Out.` }
    : { tone: 'safe', title: 'Caught', text: `The ${w.item} goes to ${w.target}'s hand.` }),
  'no-wound': (w) => ({ tone: '', title: 'No effect', text: `The hit did nothing.${lands(w)}` }),
  wounded: (w) => ({ tone: w.targetOut || w.out ? 'out' : 'hit', title: woundedTitle(w), text: `${w.attack.row!.name}: ${w.attack.rowOutcome}${lands(w)}`, aside: lands(w).trim() }),
  'row-caught': (w) => ({ tone: 'out', title: `Caught it: ${w.attacker} is Out`, text: `${w.attack.row!.name}: ${w.target} holds on and stays in, and ${w.attacker} is Out instead.` }),
  interrupted: (w) => ({ tone: 'out', title: `Stopped: ${w.attacker} is Out`, text: `Out stops the attack at once.${lands(w)}` }),
  manual: (w) => ({ tone: '', title: 'The GM records this wound', text: `${tableName(w.attack.impact!.table)} table, ${locName(w.attack.landing!.part!).toLowerCase()}, Impact ${w.attack.impact!.total}.${lands(w)}` }),
}

/** "Roy Carver is Out", both names when a Headshot puts the thrower out too, or the wound when the target stays in. */
function woundedTitle(w: Words): string {
  if (w.targetOut && w.out) return `${w.target} and ${w.attacker} are Out`
  if (w.targetOut) return `${w.target} is Out`
  return `${w.target}: ${w.attack.row!.severity} wound`
}

function wordsOf(state: CombatState, attack: CombatAttack): Words {
  const attacker = state.combatants.find((entry) => entry.key === attack.attackerKey)!
  const target = state.combatants.find((entry) => entry.key === attack.aim!.targetKey)!
  return {
    attacker: attacker.name, target: target.name, item: attack.frozen!.weaponName.toLowerCase(),
    thrown: isThrow(attack.frozen!), out: attacker.outReason !== null, targetOut: target.outReason !== null, attack,
  }
}

/** How a closed attack ended; a wound still waiting on its table has no words yet. */
export const outcomeBanner = (state: CombatState, attack: CombatAttack): Banner | null =>
  BANNERS[attack.outcome ?? '']?.(wordsOf(state, attack)) ?? null
