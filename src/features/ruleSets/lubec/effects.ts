import type { LubecModifier } from './derivations'
import { LUBEC_VALUE_NAMES, type LubecValueName } from './sheet'

// An active effect: the sheet's manual override. Each one records its cause
// and an ordered list of steps; only the first remaining step counts towards
// values, and stepping down past the last step removes the effect. Every
// stored field the sheet does not model, on an effect or a step, is kept.

type Fields = Record<string, unknown>

/** How long a step lasts, or what ends it. A step with none is ended by hand, as every hand-made step is. */
export const LUBEC_STEP_UNTILS = ['next-round-end', 'rounds', 'combat-end', 'long-rest', 'treated', 'put-back', 'by-hand', 'lasting'] as const
export type LubecStepUntil = typeof LUBEC_STEP_UNTILS[number]

/** A fractional loss: the uninjured value times `factor` ("halved" is 0.5). */
export type LubecFraction = { target: LubecValueName; factor: number }
/** "Handle drops to 10": the value becomes `value` for as long as the step lasts. */
export type LubecSetTo = { target: LubecValueName; value: number }

/**
 * One stage of an effect: its changes to named Stats or Saves, and labels the sheet shows but does not compute.
 * A wound card's step may also carry fractional losses, a value it sets, and when it ends; every other
 * stored field is kept as it is.
 */
export type LubecEffectStep = Fields & {
  modifiers: LubecModifier[]
  labels: string[]
  fractions?: LubecFraction[]
  setTo?: LubecSetTo[]
  until?: LubecStepUntil
}

export type LubecEffect = Fields & {
  id: string
  name: string
  /** Why the character carries the effect; always recorded, not shown on the one-line view. */
  cause: string
  steps: LubecEffectStep[]
}

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const listOf = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : [])

const textOf = (raw: unknown): string => (typeof raw === 'string' ? raw : '')

export const isLubecValueName = (name: unknown): name is LubecValueName =>
  (LUBEC_VALUE_NAMES as readonly unknown[]).includes(name)

// A modifier that names no Stat or Save, or changes it by no whole number,
// cannot count towards a value, so it is not read.
const isModifier = (raw: unknown): raw is LubecModifier =>
  isRecord(raw) && isLubecValueName(raw.target) && Number.isInteger(raw.amount)

function parseStep(raw: unknown): LubecEffectStep {
  const stored = isRecord(raw) ? raw : {}
  return {
    ...stored,
    modifiers: listOf(stored.modifiers).filter(isModifier).map(({ target, amount }) => ({ target, amount })),
    labels: listOf(stored.labels).filter((label): label is string => typeof label === 'string'),
  }
}

// An effect stored without an id is named by its place in the list, which is
// stable for as long as the list is, and is given that id on its next save.
function parseEffect(raw: Fields, index: number): LubecEffect {
  return {
    ...raw,
    id: textOf(raw.id) || `effect-${index + 1}`,
    name: textOf(raw.name),
    cause: textOf(raw.cause),
    steps: listOf(raw.steps).map(parseStep),
  }
}

/** A stored effects list as the sheet reads it. */
export const parseLubecEffects = (raw: unknown): LubecEffect[] =>
  listOf(raw).filter(isRecord).map(parseEffect)

const isFraction = (raw: unknown): raw is LubecFraction =>
  isRecord(raw) && isLubecValueName(raw.target) && typeof raw.factor === 'number' && raw.factor >= 0 && raw.factor <= 1

const isSetTo = (raw: unknown): raw is LubecSetTo =>
  isRecord(raw) && isLubecValueName(raw.target) && Number.isInteger(raw.value) && (raw.value as number) >= 0

/** A step's fractional losses, as read: one that names no value or no factor between 0 and 1 counts for nothing. */
export const lubecStepFractions = (step: LubecEffectStep): LubecFraction[] => listOf(step.fractions).filter(isFraction)

/** A step's "drops to" values, as read. */
export const lubecStepSetTo = (step: LubecEffectStep): LubecSetTo[] => listOf(step.setTo).filter(isSetTo)

/** What ends a step, when it says so in a way the sheet reads. */
export const lubecStepUntil = (step: LubecEffectStep): LubecStepUntil | null =>
  ((LUBEC_STEP_UNTILS as readonly unknown[]).includes(step.until) ? step.until as LubecStepUntil : null)

/** Everything one step changes, as modifiers: its flat amounts, then its fractions and "drops to" values. */
export const lubecStepModifiers = (step: LubecEffectStep): LubecModifier[] => [
  ...step.modifiers,
  ...lubecStepFractions(step).map(({ target, factor }) => ({ target, amount: 0, factor })),
  ...lubecStepSetTo(step).map(({ target, value }) => ({ target, amount: 0, setTo: value })),
]

/** The modifiers that count now: each effect's current step's. */
export const lubecActiveModifiers = (effects: readonly LubecEffect[]): LubecModifier[] =>
  effects.flatMap((effect) => (effect.steps[0] ? lubecStepModifiers(effect.steps[0]) : []))

/** Drops the effect's current step; on its last step, removes the effect. */
export function stepDownLubecEffect(effects: readonly LubecEffect[], id: string): LubecEffect[] {
  return effects.flatMap((effect) => {
    if (effect.id !== id) return [effect]
    return effect.steps.length > 1 ? [{ ...effect, steps: effect.steps.slice(1) }] : []
  })
}

/** The list with the effect of the same id replaced, or the effect added at the end when it is new. */
export function putLubecEffect(effects: readonly LubecEffect[], next: LubecEffect): LubecEffect[] {
  return effects.some((effect) => effect.id === next.id)
    ? effects.map((effect) => (effect.id === next.id ? next : effect))
    : [...effects, next]
}

export const removeLubecEffect = (effects: readonly LubecEffect[], id: string): LubecEffect[] =>
  effects.filter((effect) => effect.id !== id)

const signed = (amount: number) => (amount < 0 ? `${amount}` : `+${amount}`)

const FRACTION_WORDS: Readonly<Record<string, string>> = { '0.5': 'halved', '0.25': 'to one quarter', '0.75': 'less one quarter' }

const fractionWords = ({ target, factor }: LubecFraction) => `${target} ${FRACTION_WORDS[String(factor)] ?? `x${factor}`}`

/** A step as the one-line view reads it: "Handle -40, Dazed". */
export function describeLubecEffectStep(step: LubecEffectStep): string {
  const modifiers = step.modifiers.map((modifier) => `${modifier.target} ${signed(modifier.amount)}`)
  const fractions = lubecStepFractions(step).map(fractionWords)
  const setTo = lubecStepSetTo(step).map(({ target, value }) => `${target} drops to ${value}`)
  return [...fractions, ...modifiers, ...setTo, ...step.labels].join(', ')
}
