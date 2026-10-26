import {
  describeLubecCheckOutcome,
  describeLubecOutcome,
  lubecAdvantageName,
  isLubecCritical,
  lubecCheckTarget,
  type LubecAdvantage,
} from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet, LubecCounters } from '../ruleSets/lubec/characterRecord'
import { lubecCurrentValue, lubecFinalValue, type LubecModifier } from '../ruleSets/lubec/derivations'
import type { LubecLastRoll } from '../ruleSets/lubec/lastRoll'
import type { LubecValueName } from '../ruleSets/lubec/sheet'

// What each roll circle on the Core page shows, as the combined prototype
// draws it: the value rolled under, a roll spinning, or the roll's result
// as "roll/target", with the base and its class modifier in a note below.
// The Panic Check and the Recovery Save have a circle each, built the same way.

/** A Stat or Save's own circle, or the Panic Check's or the Recovery Save's. */
export type LubecCircleName = LubecValueName | 'Panic' | 'Recovery'

/** The circle a roll shows its result on. */
export const lubecRollCircle = (roll: LubecLastRoll): LubecCircleName =>
  (roll.kind === 'panic' ? 'Panic' : roll.kind === 'recovery' ? 'Recovery' : roll.against)

/**
 * Where a spin is: its dice spinning, then, under Advantage or Disadvantage,
 * both dice settled with "done" showing, then the ghost merging into the kept die.
 */
export type LubecSpinPhase = 'spin' | 'done' | 'merge'

/**
 * A roll spinning on one circle: the target, the die it rolls, the number it
 * shows while it spins, the mode it was rolled with, the second die's ghost
 * number under Advantage or Disadvantage, and the counters as they stood before the roll.
 */
export type LubecSpin = {
  name: LubecCircleName
  target: number
  sides: number
  preview: number
  step: number
  advantage: LubecAdvantage
  ghost: number | null
  phase: LubecSpinPhase
  counters: LubecCounters
}

/**
 * The mode the Advantage switch shows. A roll uses the mode up as it is made,
 * but the switch keeps showing the mode a roll spins with until its ghost has
 * merged, and goes back to Normal only once the result lands.
 */
export const lubecShownAdvantage = (spin: LubecSpin | null, mode: LubecAdvantage): LubecAdvantage =>
  spin?.advantage ?? mode

/**
 * The sheet as the Core page shows it. The roll is recorded on the click, so
 * while it spins the counters show what they were before it, and any Stress
 * it adds or removes lands with its number, as every other part of its result does.
 */
export const lubecShownSheet = (sheet: LubecCharacterSheet, spin: LubecSpin | null): LubecCharacterSheet =>
  (spin ? { ...sheet, counters: spin.counters } : sheet)

export type LubecCircleFace =
  | { kind: 'missing' }
  /** `armed` when the value includes an armed skill's bonus. */
  | { kind: 'value'; value: number; armed: boolean }
  /** `ghost` is the second die's number under Advantage or Disadvantage. */
  | { kind: 'rolling'; preview: number; target: number; ghost: number | null; phase: LubecSpinPhase }
  | { kind: 'result'; roll: LubecLastRoll }

export type LubecCircleState = { armed: string | null; result: LubecLastRoll | null; spin: LubecSpin | null }

/** A double on a Stat Check or Save; the Panic Check and the Recovery Save have none. */
export const isLubecDoubleRoll = (roll: LubecLastRoll): boolean =>
  roll.kind !== 'panic' && roll.kind !== 'recovery' && isLubecCritical(roll)

/** The skill a Stat Check or Save was rolled with. */
export const lubecRolledSkill = (roll: LubecLastRoll): string | null =>
  (roll.kind === 'panic' || roll.kind === 'recovery' ? null : roll.skill)

type ValueRequest = { sheet: LubecCharacterSheet; name: LubecValueName; modifiers: readonly LubecModifier[] }

// The current value, with an armed skill's bonus; a hole has nothing to roll under.
function lubecValueFace({ sheet, name, modifiers }: ValueRequest, armed: string | null): LubecCircleFace {
  const current = lubecCurrentValue(sheet, name, modifiers)
  if (current === null) return { kind: 'missing' }
  const target = lubecCheckTarget(sheet, name, armed) ?? current
  return { kind: 'value', value: target, armed: target !== current }
}

// The spin's previews; settled, the two dice as rolled; merging, the kept die as the ghost goes into it.
function spinFace(spin: LubecSpin, roll: LubecLastRoll | null): LubecCircleFace {
  const face = { kind: 'rolling' as const, preview: spin.preview, target: spin.target, ghost: spin.ghost, phase: spin.phase }
  if (spin.phase === 'spin' || !roll) return face
  return { ...face, preview: spin.phase === 'done' ? roll.dice[0] : roll.result, ghost: roll.dice[1] ?? null }
}

// A roll spinning on the circle, or the result it shows; null while it shows its value.
function shownFace(name: LubecCircleName, { spin, result }: LubecCircleState): LubecCircleFace | null {
  if (spin?.name === name) return spinFace(spin, result)
  return result ? { kind: 'result', roll: result } : null
}

export const lubecCircleFace = (request: ValueRequest, state: LubecCircleState): LubecCircleFace =>
  shownFace(request.name, state) ?? lubecValueFace(request, state.armed)

/** The Panic Check's or the Recovery Save's circle: what it rolls against, or a hole. */
export const lubecTallyFace = (name: 'Panic' | 'Recovery', target: number | null, state: LubecCircleState): LubecCircleFace =>
  shownFace(name, state) ?? (target === null ? { kind: 'missing' } : { kind: 'value', value: target, armed: false })

const signed = (amount: number): string => `${amount > 0 ? '+' : ''}${amount}`

const isGear = (modifier: LubecModifier): boolean => modifier.source === 'gear'

/** What the modifiers on one value add up to, the effects' and gear's apart. */
function sourceTotals(name: LubecValueName, modifiers: readonly LubecModifier[]) {
  const on = modifiers.filter((modifier) => modifier.target === name)
  const total = (list: readonly LubecModifier[]) => list.reduce((sum, modifier) => sum + modifier.amount, 0)
  return { effect: total(on.filter((modifier) => !isGear(modifier))), gear: total(on.filter(isGear)) }
}

const SOURCES = ['effect', 'gear'] as const

// "-10 effect -20 gear"; where the floor at 0 clips the total, one part that
// adds up, rather than numbers that do not: "-15 effect and gear".
function modifierParts(request: ValueRequest, final: number, current: number): string[] {
  const totals = sourceTotals(request.name, request.modifiers)
  const sources = SOURCES.filter((source) => totals[source] !== 0)
  if (final + totals.effect + totals.gear !== current) return [`${signed(current - final)} ${sources.join(' and ')}`]
  return sources.map((source) => `${signed(totals[source])} ${source}`)
}

/**
 * What the class, any effect and gear add to the base: "+5 class", "-10
 * effect", "-20 gear". Empty while a value is a hole or nothing is added, as
 * the prototype shows no note then.
 */
export function lubecNoteParts(request: ValueRequest): string[] {
  const { sheet, name, modifiers } = request
  const base = sheet.base[name]
  const final = lubecFinalValue(sheet, name)
  const current = lubecCurrentValue(sheet, name, modifiers)
  if (base === null || final === null || current === null) return []
  return [...(final === base ? [] : [`${signed(final - base)} class`]), ...modifierParts(request, final, current)]
}

/** Speed at 0 is immobile (the plan); the note under the Speed circle says so. */
export const isLubecImmobile = ({ sheet, name, modifiers }: ValueRequest): boolean =>
  name === 'Speed' && lubecCurrentValue(sheet, name, modifiers) === 0

const IMMOBILE = 'immobile'

// The last part before "immobile" takes the comma, so the note reads "47 -47 gear, immobile".
const withComma = (parts: readonly string[]): string[] => parts.map((part, n) => (n === parts.length - 1 ? `${part},` : part))

/**
 * The note under a circle, in parts the sheet never breaks inside: the base
 * and what is added to it, "24", "+5 class", and "immobile" after them at
 * Speed 0. The base alone when the circle is a hole, and nothing when the
 * circle already shows the base.
 */
export function lubecBaseNoteParts(request: ValueRequest): string[] {
  const base = request.sheet.base[request.name]
  if (base === null) return []
  const parts = [`${base}`, ...lubecNoteParts(request)]
  if (isLubecImmobile(request)) return [...withComma(parts), IMMOBILE]
  return parts.length === 1 && lubecCurrentValue(request.sheet, request.name, request.modifiers) !== null ? [] : parts
}

/** The note under a circle as one line: "24 +5 class -20 gear". */
export const lubecBaseNote = (request: ValueRequest): string => lubecBaseNoteParts(request).join(' ')

const lowerFirst = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

type StatusParts = { what: string; target: string; outcome: string }

// What was rolled, what it was rolled against and how it came out, for each kind of roll.
function statusParts(roll: LubecLastRoll): StatusParts {
  if (roll.kind === 'panic') return { what: 'Panic Check', target: `Stress ${roll.target}`, outcome: describeLubecOutcome(roll.outcome, 0) }
  if (roll.kind === 'recovery') {
    const outcome = describeLubecOutcome(roll.outcome, roll.stressAdded - roll.stressRemoved)
    return { what: `Recovery Save on ${roll.against}`, target: `${roll.target}`, outcome }
  }
  const skill = roll.skill === null ? '' : ` + ${roll.skill}`
  return { what: `${roll.against}${skill}`, target: `${roll.target}`, outcome: describeLubecCheckOutcome(roll) }
}

// Both dice under Advantage or Disadvantage, so anyone viewing sees which one was kept.
const advantageNote = (roll: LubecLastRoll): string =>
  (roll.advantage === 'normal' ? '' : ` (${lubecAdvantageName(roll.advantage)}, ${roll.dice.join(' and ')})`)

/** "Handle + Boatwork: 32 vs 65 - success.", with both dice under Advantage and any Stress the roll changed. */
export function lubecRollStatus(roll: LubecLastRoll): string {
  const { what, target, outcome } = statusParts(roll)
  return `${what}${advantageNote(roll)}: ${roll.result} vs ${target} - ${lowerFirst(outcome)}.`
}

// "Handle check", "Panic Check", "Recovery Save".
const circleRollName = (name: LubecCircleName): string =>
  (name === 'Panic' ? 'Panic Check' : name === 'Recovery' ? 'Recovery Save' : `${name} check`)

/** The status line: a roll spinning, a roll whose result was cleared, or the last roll of any kind. */
export function lubecCirclesStatus(spin: LubecSpin | null, cleared: LubecLastRoll | null, roll: LubecLastRoll | null): string {
  if (spin) return `Rolling ${circleRollName(spin.name)}...${spin.phase === 'spin' ? '' : ' done'}`
  if (cleared) return `${circleRollName(lubecRollCircle(cleared))} cleared. Score unchanged.`
  return roll ? lubecRollStatus(roll) : ''
}

export const LUBEC_SPIN_STEPS = 12

/** The prototype's slowing spin: each preview stays a little longer than the last. */
export const lubecSpinDelay = (step: number): number => Math.round(14 * Math.pow(1.36, step))

/** How long "done" shows once both dice settle, and how long the ghost takes to merge, as the CSS transition does. */
export const LUBEC_DONE_MS = 450
export const LUBEC_MERGE_MS = 280

const PHASE_WAITS: Readonly<Record<Exclude<LubecSpinPhase, 'spin'>, number>> = { done: LUBEC_DONE_MS, merge: LUBEC_MERGE_MS }

/** How long the spin stays as it is before its next frame. */
export const lubecSpinWait = (spin: LubecSpin): number =>
  (spin.phase === 'spin' ? lubecSpinDelay(spin.step) : PHASE_WAITS[spin.phase])

const NEXT_PHASE: Readonly<Record<LubecSpinPhase, LubecSpinPhase | null>> = { spin: 'done', done: 'merge', merge: null }

/**
 * The spin's next frame: a new number on each die until the last step, then,
 * with a ghost, "done" and the merge; null once the result lands.
 */
export function lubecNextSpin(spin: LubecSpin, preview: (sides: number) => number): LubecSpin | null {
  if (spin.phase === 'spin' && spin.step + 1 < LUBEC_SPIN_STEPS) {
    return { ...spin, step: spin.step + 1, preview: preview(spin.sides), ghost: spin.ghost === null ? null : preview(spin.sides) }
  }
  const phase = spin.ghost === null ? null : NEXT_PHASE[spin.phase]
  return phase ? { ...spin, phase } : null
}
