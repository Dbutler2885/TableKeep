import type { LubecEffect, LubecEffectStep } from '../ruleSets/lubec/effects'
import type { LubecValueName } from '../ruleSets/lubec/sheet'

// An effect as the editor holds it while it is open: amounts and labels as
// typed, so a half-typed "-" is never lost, read back into an effect on save.
// Each step carries its stored fields the editor does not show, so a save
// keeps them wherever the step moves.

type Fields = Record<string, unknown>

export type LubecModifierDraft = { target: LubecValueName; amount: string }

export type LubecStepDraft = { stored: Fields; modifiers: LubecModifierDraft[]; labels: string }

export type LubecEffectDraft = { name: string; cause: string; steps: LubecStepDraft[] }

export const emptyLubecStepDraft = (): LubecStepDraft => ({ stored: {}, modifiers: [], labels: '' })

function stepDraft({ modifiers, labels, ...stored }: LubecEffectStep): LubecStepDraft {
  return { stored, modifiers: modifiers.map(({ target, amount }) => ({ target, amount: `${amount}` })), labels: labels.join('\n') }
}

/** The editor's starting draft: the effect's own parts, or one empty step for a new effect. */
export function lubecEffectDraft(effect: LubecEffect | null): LubecEffectDraft {
  if (!effect) return { name: '', cause: '', steps: [emptyLubecStepDraft()] }
  return { name: effect.name, cause: effect.cause, steps: effect.steps.map(stepDraft) }
}

// An amount left empty or not a whole number changes nothing, so it is not kept.
function wholeAmount(text: string): number | null {
  const trimmed = text.trim()
  const amount = Number(trimmed)
  return trimmed !== '' && Number.isInteger(amount) ? amount : null
}

function stepFromDraft(draft: LubecStepDraft): LubecEffectStep {
  const modifiers = draft.modifiers.flatMap(({ target, amount }) => {
    const whole = wholeAmount(amount)
    return whole === null ? [] : [{ target, amount: whole }]
  })
  const labels = draft.labels.split('\n').map((label) => label.trim()).filter(Boolean)
  return { ...draft.stored, modifiers, labels }
}

const isEmptyStep = (step: LubecEffectStep) => step.modifiers.length === 0 && step.labels.length === 0

export const canSaveLubecEffectDraft = (draft: LubecEffectDraft) => draft.name.trim() !== ''

/** The effect a saved draft makes, keeping the stored fields of the effect it edits; a step left empty is dropped. */
export function lubecEffectFromDraft(draft: LubecEffectDraft, id: string, stored: Fields = {}): LubecEffect {
  return {
    ...stored,
    id,
    name: draft.name.trim(),
    cause: draft.cause.trim(),
    steps: draft.steps.map(stepFromDraft).filter((step) => !isEmptyStep(step)),
  }
}

/** A copy of the list with the item at `index` replaced. */
export const replacedAt = <Item>(items: readonly Item[], index: number, item: Item): Item[] =>
  items.map((current, at) => (at === index ? item : current))

/** A copy of the list without the item at `index`. */
export const removedAt = <Item>(items: readonly Item[], index: number): Item[] =>
  items.filter((_item, at) => at !== index)
