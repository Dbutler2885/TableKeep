import { signed } from '../engine/attackFlow'
import { lubecAdvantageName } from '../../../ruleSets/lubec/checkRoll'
import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import type { CombatAttack, CombatCatchRoll, CombatDefenseRoll, CombatImpact, CombatStrengthRoll } from '../engine/types'
import { isThrow } from './attackWords'

/** One card of the result sequence, in the mock-up's order. */
export type ResultStep = 'attack' | 'defense' | 'catch' | 'location' | 'wound' | 'check'

export const STEP_NAMES: Readonly<Record<ResultStep, string>> = {
  attack: 'Attack roll', defense: 'Defense roll', catch: 'Catch roll', location: 'Where it lands', wound: 'The wound', check: 'Check',
}

/** A card's heading: the row's own "Body Save" or "Handle Check" for its roll, otherwise the step's name. */
export function cardName(attack: CombatAttack, card: ResultStep): string {
  const check = card === 'check' ? attack.row!.check! : null
  return check ? `${check.against} ${check.kind === 'save' ? 'Save' : 'Check'}` : STEP_NAMES[card]
}

/** The card the attack's persisted step belongs to; Strength is the wound card's first roll. */
const CARD_OF: Readonly<Record<string, ResultStep>> = { defense: 'defense', catch: 'catch', location: 'location', strength: 'wound', wound: 'wound', check: 'check' }
export const activeCard = (attack: CombatAttack): ResultStep | null => (attack.closed ? null : CARD_OF[attack.step])

const SHOWN: Readonly<Record<ResultStep, (attack: CombatAttack) => boolean>> = {
  attack: () => true,
  defense: (attack) => attack.defense !== undefined || attack.step === 'defense',
  catch: (attack) => attack.catchChance != null,
  location: (attack) => attack.landing != null,
  wound: (attack) => attack.strength != null || attack.impact != null || attack.step === 'strength',
  check: (attack) => attack.row?.check != null,
}

/** The cards reached so far: every step that happened or is waiting now. */
export const shownCards = (attack: CombatAttack): ResultStep[] =>
  (Object.keys(STEP_NAMES) as ResultStep[]).filter((card) => SHOWN[card](attack))

/** What is still to come after the waiting card, while the attack is open. */
const LATER: Readonly<Record<string, readonly string[]>> = {
  defense: ['the result'],
  catch: ['the result'],
  location: [STEP_NAMES.wound],
  strength: ['the result'],
  check: ['the result'],
}

export function stillToCome(attack: CombatAttack): string | null {
  const later = attack.closed ? undefined : LATER[attack.step]
  return later ? `Still to come: ${later.join(', ')}` : null
}

const PROGRESS_NAMES: Readonly<Record<ResultStep, string>> = {
  attack: 'Attack', defense: 'Defense', catch: 'Catch', location: 'Location', wound: 'Wound', check: 'Check',
}

/** Progress follows the same reached steps as the cards, including a catch or table check only when needed. */
export function resultProgress(attack: CombatAttack): { cards: ResultStep[]; steps: string[]; now: number } {
  const cards = shownCards(attack)
  const current = activeCard(attack)
  const steps = cards.map((card) => (card === 'check' ? cardName(attack, card) : PROGRESS_NAMES[card]))
  return { cards, steps, now: current === null ? cards.length : cards.indexOf(current) }
}

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
  const what = isThrow(attack.frozen!) ? 'throw' : 'attack'
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

const GROUP_NAMES: Readonly<Record<string, string>> = {
  'head-neck': 'Head and neck', 'torso-waist': 'Torso and waist', groin: 'Groin', arms: 'Arms', hand: 'Hand', legs: 'Legs',
}

export type WoundBoxWords = { head: string; tag: string | null; severity: { cls: string; name: string } | null; trauma: string | null; title: string | null; body: string }

/** A resolved table row: its table, group, row Impact, severity and Trauma. */
function rowBox(row: NonNullable<CombatAttack['row']>, table: string, total: number): WoundBoxWords {
  return {
    head: `${table} · ${GROUP_NAMES[row.group]} · Impact ${total > row.impact ? `${row.impact}+` : total}`, tag: null,
    severity: { cls: row.severity === 'Serious' ? 'se' : 'mi', name: row.severity }, trauma: `Trauma ${row.trauma ? '+1' : '0'}`, title: `${row.name}.`, body: row.text,
  }
}

const plainBox = (head: string, tag: string | null, body: string): WoundBoxWords => ({ head, tag, severity: null, trauma: null, title: null, body })

/** The wound box: no wound at 0 or less, the row a Dodgeball hit reached, or a wound the GM records by hand. */
export function woundBox(attack: CombatAttack, target: string): WoundBoxWords {
  const impact = attack.impact!
  const table = tableName(impact.table)
  if (impact.total <= 0) return plainBox(table, 'No wound', `Impact ${impact.total}: a hit with no effect.`)
  if (attack.row) return rowBox(attack.row, table, impact.total)
  const head = `${table} · ${locName(attack.landing!.part!).toLowerCase()} · Impact ${impact.total}`
  return plainBox(head, null, `The GM records this wound on ${target}'s sheet. Nothing was changed automatically.`)
}

/** "Success. 12 is at or under 30.", saying which die was kept under Advantage or Disadvantage. */
export function checkVerdict(rolled: NonNullable<CombatAttack['check']>): string {
  const kept = rolled.dice.length > 1 ? ` ${lubecAdvantageName(rolled.advantage)} kept ${pad(rolled.result)} of ${rolled.dice.map(pad).join(' and ')}.` : ''
  return rolled.success ? `Success. ${pad(rolled.result)} is at or under ${rolled.target}.${kept}` : `Failure. ${pad(rolled.result)} is over ${rolled.target}.${kept}`
}

/** "Handle Check at Disadvantage: at or under Handle". */
export function checkAsk(check: NonNullable<NonNullable<CombatAttack['row']>['check']>): string {
  const mode = check.advantage === 'normal' ? '' : ` at ${lubecAdvantageName(check.advantage)}`
  return `${check.against} ${check.kind === 'save' ? 'Save' : 'Check'}${mode}: at or under ${check.against}`
}
