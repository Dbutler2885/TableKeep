import type { LubecModifier } from './derivations'
import { LUBEC_VALUE_NAMES, type LubecValueName } from './sheet'

// An active effect: the sheet's manual override. Each one records its cause
// and an ordered list of steps; only the first remaining step counts towards
// values, and stepping down past the last step removes the effect. Every
// stored field the sheet does not model, on an effect or a step, is kept.

type Fields = Record<string, unknown>

/** One stage of an effect: its changes to named Stats or Saves, and labels the sheet shows but does not compute. */
export type LubecEffectStep = Fields & { modifiers: LubecModifier[]; labels: string[] }

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

/** The modifiers that count now: each effect's current step's. */
export const lubecActiveModifiers = (effects: readonly LubecEffect[]): LubecModifier[] =>
  effects.flatMap((effect) => effect.steps[0]?.modifiers ?? [])

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

/** A step as the one-line view reads it: "Handle -40, Dazed". */
export function describeLubecEffectStep(step: LubecEffectStep): string {
  const modifiers = step.modifiers.map((modifier) => `${modifier.target} ${signed(modifier.amount)}`)
  return [...modifiers, ...step.labels].join(', ')
}
