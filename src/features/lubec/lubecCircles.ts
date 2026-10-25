import { describeLubecCheckOutcome, lubecCheckTarget, type LubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { lubecCurrentValue, lubecFinalValue, type LubecModifier } from '../ruleSets/lubec/derivations'
import type { LubecValueName } from '../ruleSets/lubec/sheet'

// What each roll circle on the Core page shows, as the combined prototype
// draws it: the value rolled under, a check spinning, or the check's result
// as "roll/target", with the base and its class modifier in a note below.

/** A check being rolled on one circle: the target and the number it shows while it spins. */
export type LubecSpin = { name: LubecValueName; target: number; preview: number; step: number }

export type LubecCircleFace =
  | { kind: 'missing' }
  /** `armed` when the value includes an armed skill's bonus. */
  | { kind: 'value'; value: number; armed: boolean }
  | { kind: 'rolling'; preview: number; target: number }
  | { kind: 'result'; roll: LubecCheckRoll }

export type LubecCircleState = { armed: string | null; result: LubecCheckRoll | null; spin: LubecSpin | null }

type ValueRequest = { sheet: LubecCharacterSheet; name: LubecValueName; modifiers: readonly LubecModifier[] }

// The current value, with an armed skill's bonus; a hole has nothing to roll under.
function lubecValueFace({ sheet, name, modifiers }: ValueRequest, armed: string | null): LubecCircleFace {
  const current = lubecCurrentValue(sheet, name, modifiers)
  if (current === null) return { kind: 'missing' }
  const target = lubecCheckTarget(sheet, name, armed) ?? current
  return { kind: 'value', value: target, armed: target !== current }
}

export function lubecCircleFace(request: ValueRequest, state: LubecCircleState): LubecCircleFace {
  if (state.spin?.name === request.name) return { kind: 'rolling', preview: state.spin.preview, target: state.spin.target }
  if (state.result) return { kind: 'result', roll: state.result }
  return lubecValueFace(request, state.armed)
}

const signed = (amount: number): string => `${amount > 0 ? '+' : ''}${amount}`

/**
 * What the class, and any effect, add to the base: "+5 class", "-10 effect".
 * Empty while a value is a hole or nothing is added, as the prototype shows no note then.
 */
export function lubecNoteParts({ sheet, name, modifiers }: ValueRequest): string[] {
  const base = sheet.base[name]
  const final = lubecFinalValue(sheet, name)
  const current = lubecCurrentValue(sheet, name, modifiers)
  if (base === null || final === null || current === null) return []
  return [
    ...(final === base ? [] : [`${signed(final - base)} class`]),
    ...(current === final ? [] : [`${signed(current - final)} effect`]),
  ]
}

/**
 * The note under a circle: "24 +5 class", the base and what is added to it.
 * The base alone when the circle is a hole, and nothing when the circle already shows the base.
 */
export function lubecBaseNote(request: ValueRequest): string {
  const base = request.sheet.base[request.name]
  const parts = lubecNoteParts(request)
  if (base === null || (parts.length === 0 && lubecCurrentValue(request.sheet, request.name, request.modifiers) !== null)) return ''
  return [base, ...parts].join(' ')
}

const lowerFirst = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

/** "Handle + Boatwork: 32 vs 65 - success.", with any Stress the roll added. */
export function lubecCheckStatus(roll: LubecCheckRoll): string {
  const skill = roll.skill === null ? '' : ` + ${roll.skill}`
  return `${roll.against}${skill}: ${roll.result} vs ${roll.target} - ${lowerFirst(describeLubecCheckOutcome(roll))}.`
}

/** The status line: a check spinning, a cleared result, or the last check's result. */
export function lubecCirclesStatus(spin: LubecSpin | null, check: LubecCheckRoll | null, cleared: boolean): string {
  if (spin) return `Rolling ${spin.name} check...`
  if (!check) return ''
  return cleared ? `${check.against} check cleared. Score unchanged.` : lubecCheckStatus(check)
}

export const LUBEC_SPIN_STEPS = 12

/** The prototype's slowing spin: each preview stays a little longer than the last. */
export const lubecSpinDelay = (step: number): number => Math.round(14 * Math.pow(1.36, step))
