import { signed } from '../engine/attackFlow'
import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import type { CombatAttack, CombatCatchRoll, CombatDefenseRoll, CombatImpact, CombatStrengthRoll } from '../engine/types'

/** One card of the result sequence, in the mock-up's order. */
export type ResultStep = 'attack' | 'defense' | 'catch' | 'location' | 'wound'

export const STEP_NAMES: Readonly<Record<ResultStep, string>> = {
  attack: 'Attack roll', defense: 'Defense roll', catch: 'Catch roll', location: 'Where it lands', wound: 'The wound',
}

/** The card the attack's persisted step belongs to; Strength is the wound card's first roll. */
const CARD_OF: Readonly<Record<string, ResultStep>> = { defense: 'defense', catch: 'catch', location: 'location', strength: 'wound', wound: 'wound' }
export const activeCard = (attack: CombatAttack): ResultStep | null => (attack.closed ? null : CARD_OF[attack.step])

const SHOWN: Readonly<Record<ResultStep, (attack: CombatAttack) => boolean>> = {
  attack: () => true,
  defense: (attack) => attack.defense !== undefined || attack.step === 'defense',
  catch: (attack) => attack.catchChance != null,
  location: (attack) => attack.landing != null,
  wound: (attack) => attack.strength != null || attack.impact != null || attack.step === 'strength',
}

/** The cards reached so far: every step that happened or is waiting now. */
export const shownCards = (attack: CombatAttack): ResultStep[] =>
  (Object.keys(STEP_NAMES) as ResultStep[]).filter((card) => SHOWN[card](attack))

/** What is still to come after the waiting card, while the attack is open. */
const LATER: Readonly<Record<string, readonly string[]>> = {
  defense: [STEP_NAMES.location, STEP_NAMES.wound],
  catch: ['the result'],
  location: [STEP_NAMES.wound],
  strength: ['the result'],
}

export function stillToCome(attack: CombatAttack): string | null {
  const later = attack.closed ? undefined : LATER[attack.step]
  return later ? `Still to come: ${later.join(', ')}` : null
}

/** The stepper over the result: throw, Defense, catch or location, wound. */
const STEPPER_NOW: Readonly<Record<string, number>> = { aim: 0, defense: 1, catch: 2, location: 2, strength: 3, wound: 3, done: 4 }
export const resultStepperNow = (attack: CombatAttack): number => STEPPER_NOW[attack.step]

const pad = (value: number): string => String(value).padStart(2, '0')

/** Named wound tables; the rest read as their key. */
const TABLE_NAMES: Readonly<Record<string, string>> = {
  dodgeball: 'Dodgeball', thrown: 'Thrown Objects', cutting: 'Cutting', piercing: 'Piercing', blunt: 'Blunt', fisticuffs: 'Fisticuffs', gunshot: 'Gunshot',
}
export const tableName = (table: string): string => TABLE_NAMES[table] ?? table


/** Impact's chips in the mock-up's order: Quality + Base + Strength − Moved − armor (only when there is some) = Impact. */
export function impactChips(impact: CombatImpact, strengthRoll: number | null): { term: string; value: string; op: string; cls: string }[] {
  return [
    { term: 'Quality', value: String(impact.quality), op: '', cls: '' },
    { term: 'Base', value: signed(impact.base), op: '+', cls: '' },
    ...(impact.strength === null ? [] : [{ term: `Strength ${pad(strengthRoll!)}`, value: signed(impact.strength), op: '+', cls: '' }]),
    { term: 'Moved', value: String(impact.moved), op: '−', cls: 'armor' },
    ...(impact.armor > 0 ? [{ term: 'Armor', value: String(impact.armor), op: '−', cls: 'armor' }] : []),
    { term: 'Impact', value: String(impact.total), op: '=', cls: 'on' },
  ]
}


export const defenseVerdict = (defense: CombatDefenseRoll): string =>
  (defense.success ? `Defense holds. It takes off ${Math.floor(defense.roll / 10)} + 1 = ${defense.removes}.` : 'Defense fails. It takes off nothing.')

/** "Down to 0." or "Below 0." once a successful Defense stops the hit; nothing while it still lands. */
export function stopWords(attack: CombatAttack): { title: string; text: string } | null {
  const net = attack.net!
  if (net > 0) return null
  const what = attack.frozen!.choice.ranged ? 'throw' : 'attack'
  return { title: net === 0 ? 'Down to 0.' : 'Below 0.', text: `The ${what} is dodged.${net < 0 ? ` That is ${-net} below 0.` : ''}` }
}

/** The catch's item, its own chance, and how far below 0 Defense took the quality. */
export function catchFacts(attack: CombatAttack): { name: string; base: number; below: number } {
  const item = attack.catchItem!
  return { name: item.name, base: item.chance, below: -attack.net! }
}

export const catchVerdict = (rolled: CombatCatchRoll): string =>
  (rolled.success ? `Caught. ${pad(rolled.roll)} is under ${rolled.chance}.` : `Dropped. ${pad(rolled.roll)} is not under ${rolled.chance}: still a dodge.`)

export function strengthTitle(rolled: CombatStrengthRoll | null | undefined): string {
  if (!rolled) return 'Strength roll'
  return rolled.success ? `Strength roll: adds ${signed(rolled.bonus)} to Impact` : 'Strength roll: adds nothing'
}

/** The wound box: no wound at 0 or less, the Dodgeball row still to read, or a wound the GM records by hand. */
export function woundBox(attack: CombatAttack, target: string): { head: string; tag: string | null; body: string } {
  const impact = attack.impact!
  const table = tableName(impact.table)
  if (impact.total <= 0) return { head: table, tag: 'No wound', body: `Impact ${impact.total}: a hit with no effect.` }
  const head = `${table} · ${locName(attack.landing!.part!).toLowerCase()} · Impact ${impact.total}`
  if (attack.outcome === 'pending-wound') return { head, tag: null, body: `The wound is read on the ${table} table next.` }
  return { head, tag: null, body: `The GM records this wound on ${target}'s sheet. Nothing was changed automatically.` }
}
