// A weapon's lines on the item card and its attack buttons, copied from the
// inventory prototype (B's openActDialog, impactText and attack). Strength is
// rolled into Impact now, so the Impact line names the roll, not a number
// (spec 5.7, D4). The minimum Strength lines are the carrying plan's: the
// penalty, the weapon's Handle, and the table's own number (spec 5.4).

import type { LubecGear, LubecItem, LubecSupply, LubecWoundKind } from '../../ruleSets/lubec/gear/gearRecord'
import {
  lubecCannotHandle,
  lubecComputedMinStrengthPenalty,
  lubecMinStrengthPenalty,
  lubecWeaponHandle,
  type LubecWielder,
} from '../../ruleSets/lubec/gear/minStrength'
import { lubecAmmoOnYou } from '../../ruleSets/lubec/gear/supplies'
import { lubecReloadPlan } from '../../ruleSets/lubec/gear/loading'
import { supplyNameIn } from './gearLabels'
import { lubecReloadText } from './loadLabels'
import { sgn, TABLES, WOUNDS, woundsOf } from './itemLabels'
import { theName } from './moveLabels'

/** One line of the card: a term and its text, a count the card steps with − and +, the Passed and Failed switch, the missing mark after it, or the "Table says" box. */
export type LubecCardFact = {
  term: string
  text: string
  step?: 'qty' | 'loaded'
  /** The Passed and Failed switch of a heavy thing's recorded Strength roll follows the text. */
  check?: true
  /** The sheet's missing mark follows the text: a value worked out from a hole. */
  missing?: true
  tone?: 'failure'
  /** The table's own penalty, shown in its box: null while it says nothing. */
  tableSays?: number | null
}

export type LubecWeaponFacts = { gear: LubecGear; item: LubecItem; supplies: readonly LubecSupply[]; wielder: LubecWielder }

const fact = (term: string, text: string, more: Omit<LubecCardFact, 'term' | 'text'> = {}): LubecCardFact => ({ term, text, ...more })

const strengthAdds = (w: LubecItem) => w.mode !== 'firearm'

/** "Quality + 1 base + Strength roll"; a firearm adds no Strength. */
export const impactText = (w: LubecItem): string => `Quality ${sgn(w.impact ?? 0)} base${strengthAdds(w) ? ' + Strength roll' : ''}`

function typeText(w: LubecItem): string {
  if (w.mode === 'firearm') return 'Firearm. Handle Defense does not reduce it.'
  if (w.mode === 'thrown') return 'Thrown. Strength adds, as in melee.'
  return `Melee, ${w.reach === 'short' ? 'short: works in a ground grapple' : "long: can't be used on the ground"}`
}

function woundsText(w: LubecItem): string {
  const uses = woundsOf(w)
  if (uses.length > 1) return `${uses.map((u) => WOUNDS[u]).join(' or ')}, by how it's used. Armor counts that number.`
  return `${WOUNDS[uses[0]]}. Armor counts that number.`
}

// A weapon with no table stored follows its wound (spec 5.7, D16), so the card says nothing of one.
function tableFact(w: LubecItem): LubecCardFact[] {
  if (w.table === undefined) return []
  return [fact('Table', w.table === 'none' ? 'No table yet (there is no cutting table)' : TABLES[w.table] ?? w.table)]
}

const nameOf = (supplies: readonly LubecSupply[], sid: string | undefined) => supplies.find((s) => s.id === sid)?.name ?? 'no supply'

// Rule L3: what reloading would take, while it isn't full and can be reloaded.
function reloadFact({ gear, item: w, supplies }: LubecWeaponFacts): LubecCardFact[] {
  const p = lubecReloadPlan(gear, w)
  return p.ok ? [fact('Reload', lubecReloadText(w, p, supplyNameIn(supplies)))] : []
}

// Rule K6: a firearm's rounds, stepped by hand, the rest of its supply on you, and what reloading takes.
const firearmFacts = (f: LubecWeaponFacts): LubecCardFact[] => [
  fact('Loaded', `${f.item.loaded ?? 0} of ${f.item.capacity ?? 0}`, { step: 'loaded' }),
  fact('Takes', `${nameOf(f.supplies, f.item.takes)} / ${lubecAmmoOnYou(f.gear, f.item)} more on you`),
  ...reloadFact(f),
]

const minStrengthFact = (min: number, { strength }: LubecWielder): LubecCardFact =>
  (strength === null ? fact('Strength', `Needs ${min}. Yours is`, { missing: true }) : fact('Strength', `Needs ${min}. Yours is ${strength}.`))

// What the sheet worked out, beside the table's number; nothing while Strength is a hole.
const workedText = (worked: number | null) => (worked === null ? '' : ` Worked out: ${worked ? `−${worked}` : 'none'}.`)

function penaltyText(w: LubecItem, strength: number | null): string {
  const worked = lubecComputedMinStrengthPenalty(w, strength)
  if (w.handlePenaltyOverride == null) return worked ? `Handle −${worked}.` : 'None.'
  return `Handle −${w.handlePenaltyOverride}, the table says.${workedText(worked)}`
}

function penaltyFact(w: LubecItem, strength: number | null): LubecCardFact {
  const tableSays = w.handlePenaltyOverride ?? null
  if (lubecMinStrengthPenalty(w, strength) === null) return fact('Penalty', '', { missing: true, tableSays })
  return fact('Penalty', penaltyText(w, strength), { tableSays })
}

// A Handle below 0 is written with B's minus sign.
const handleText = (n: number) => (n < 0 ? `−${-n}` : String(n))

// The Handle an attack with it rolls under, before any skill, range or Defense; at 0 or less it cannot be handled.
function handleFact(w: LubecItem, { strength, handle }: LubecWielder): LubecCardFact {
  const penalty = lubecMinStrengthPenalty(w, strength)
  const own = lubecWeaponHandle(handle, penalty)
  if (own === null) return fact('Handle', '', { missing: true })
  if (lubecCannotHandle(own)) return fact('Handle', `Cannot handle this: ${handle} − ${penalty} = ${handleText(own)}.`, { tone: 'failure' })
  return fact('Handle', penalty ? `${own} with it (${handle} − ${penalty}).` : `${own}.`)
}

// The carrying plan's minimum Strength: the lines show while the weapon has a minimum, or the table has said a number.
function handlingFacts(w: LubecItem, wielder: LubecWielder): LubecCardFact[] {
  if (w.minStrength === undefined && w.handlePenaltyOverride == null) return []
  const min = w.minStrength === undefined ? [] : [minStrengthFact(w.minStrength, wielder)]
  return [...min, penaltyFact(w, wielder.strength), handleFact(w, wielder)]
}

/** A weapon's lines, in B's order: its type, Impact, wounds and table, what wielding it costs, and a firearm's rounds. */
export function lubecWeaponFacts(f: LubecWeaponFacts): LubecCardFact[] {
  const w = f.item
  return [
    fact('Type', typeText(w)), fact('Impact', impactText(w)), fact('Wounds', woundsText(w)), ...tableFact(w),
    ...handlingFacts(w, f.wielder), ...(w.mode === 'firearm' ? firearmFacts(f) : []),
  ]
}

// A weapon wounds one way or several; how it is used picks the armor number (captain, round 20).
const WOUND_USE: Readonly<Record<LubecWoundKind, string>> = { cut: 'Slash', pierce: 'Stab', blunt: 'Hit', gun: 'Fire' }
const ATTACK_WORD: Readonly<Record<NonNullable<LubecItem['mode']>, string>> = { melee: 'Attack', firearm: 'Fire', thrown: 'Throw' }

/** One of the card's attack buttons: its label, or a disabled one saying why not. */
export type LubecAttackButton = { label: string; disabled: boolean }

/** The card's attack buttons: one for each way a weapon in hand wounds, or one saying to take it in hand first. */
export function lubecAttackButtons(w: LubecItem): LubecAttackButton[] {
  if (w.kind !== 'weapon') return []
  if (w.carrier !== 'hands') return [{ label: 'Attack: take it in hand first', disabled: true }]
  const uses = woundsOf(w)
  if (uses.length > 1) return uses.map((u) => ({ label: WOUND_USE[u], disabled: false }))
  return [{ label: ATTACK_WORD[w.mode ?? 'melee'], disabled: false }]
}

/** The toast after an attack: Gear rolls no die and logs nothing, so the table rolls it. */
export const attackToast = (w: LubecItem): string =>
  (w.mode === 'firearm' ? `Fired. ${w.loaded ?? 0} of ${w.capacity ?? 0} left. Roll it at the table.` : 'Roll it at the table.')

/** Why the attack stopped, on the card: the weapon is not in hand. An empty firearm stops with the empty-weapon prompt instead. */
export const attackRefusalText = (w: LubecItem): string => `Take ${theName(w)} in hand first.`
