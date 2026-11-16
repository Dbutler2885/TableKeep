import type { LubecEffect, LubecEffectStep } from './effects'
import type { LubecWoundCardSpec, LubecWoundOutcome, LubecWoundStepSpec } from './woundTables/outcome'
import type { LubecWoundSeverity } from './woundTables/types'

// A landed final wound as Effect cards on the target's sheet: one card per
// consequence that recovers on its own schedule, every card carrying the same
// snapshot of the wound that made it. A card never re-reads the table, so a
// later change to the table's words leaves every saved wound as it landed.

/** One Check or Save the wound made the target roll when it landed. */
export type LubecWoundRolledCheck = {
  /** What the roll decided: "Severe Concussion", "Keep hold". */
  purpose: string
  kind: 'stat-check' | 'save'
  against: string
  mode: 'advantage' | 'normal' | 'disadvantage'
  target: number
  dice: number[]
  result: number
  success: boolean
  stress: number
}

/** The wound as it landed: where it came from, every die and roll that made it, and what it charged. */
export type LubecWoundSource = {
  /** Every card one wound made shares this; it is the wound's delivery identity once on the sheet. */
  groupId: string
  table: string
  tableName: string
  /** The table location that was read ("forearm"); `part` is the struck part, with its side. */
  location: string
  part: string
  impact: number
  severity: LubecWoundSeverity
  row: string
  /** The row's words as the final file prints them, or the version its Save or d2 picked. */
  prose: string
  /** The d2 a two-wound row rolled; null when it has none. */
  branch: number | null
  contentVersion: string
  /** Every die rolled for the wound, by what it was for. */
  dice: Record<string, number[]>
  checks: LubecWoundRolledCheck[]
  trauma: number
  stress: number
  minimumStress: number
}

/** What the card builder needs beyond the row: the snapshot, the one-line cause, and any rolled amounts. */
export type LubecWoundCardContext = { source: Omit<LubecWoundSource, 'groupId'>; cause: string; fingers?: number }

function stepOf(spec: LubecWoundStepSpec, context: LubecWoundCardContext): LubecEffectStep {
  const fingers = spec.perFinger && context.fingers ? [{ target: 'Handle' as const, amount: spec.perFinger * context.fingers }] : []
  const flat = [...(spec.modifiers ?? []), ...fingers]
  const merged = Object.values(flat.reduce<Record<string, { target: typeof flat[number]['target']; amount: number }>>((sum, modifier) => {
    const before = sum[modifier.target]?.amount ?? 0
    return { ...sum, [modifier.target]: { target: modifier.target, amount: before + modifier.amount } }
  }, {}))
  return {
    modifiers: merged,
    labels: spec.labels ?? [],
    until: spec.until,
    ...(spec.fractions?.length ? { fractions: spec.fractions } : {}),
    ...(spec.setTo?.length ? { setTo: spec.setTo } : {}),
  }
}

function cardOf(spec: LubecWoundCardSpec, context: LubecWoundCardContext): LubecEffect {
  return {
    id: spec.key, cardKey: spec.key, name: context.source.row, part: spec.part, cause: context.cause,
    steps: spec.steps.map((step) => stepOf(step, context)),
    struckLocation: context.source.part,
    wound: { ...context.source, groupId: '' },
  }
}

/** The outcome's cards, each with its rolled amounts filled in and the wound's snapshot; ids are the card keys until delivery names them. */
export const lubecWoundCards = (outcome: LubecWoundOutcome, context: LubecWoundCardContext): LubecEffect[] =>
  outcome.cards.map((spec) => cardOf(spec, context))

/** The wound snapshot a card carries, when it carries one the sheet can read. */
export function lubecEffectWound(effect: LubecEffect): LubecWoundSource | null {
  const wound = effect.wound as Partial<LubecWoundSource> | undefined
  if (!wound || typeof wound !== 'object' || typeof wound.row !== 'string' || typeof wound.table !== 'string') return null
  return wound as LubecWoundSource
}

const UNTIL_WORDS = {
  'next-round-end': 'Until the end of the next round',
  rounds: 'Counts down by round',
  'combat-end': 'Ends with combat',
  'long-rest': 'Step down after 1 Long Rest',
  treated: 'Step down after First Aid',
  'put-back': 'Step down once put back in place',
  'by-hand': 'Clear by hand',
  lasting: 'Lasting',
} as const

/** What ends a card's current step, as the card says it; null on a hand-made step that does not say. */
export function lubecStepTrigger(step: LubecEffectStep | undefined): string | null {
  const until = step?.until
  return typeof until === 'string' && Object.hasOwn(UNTIL_WORDS, until) ? UNTIL_WORDS[until as keyof typeof UNTIL_WORDS] : null
}

/** A final row's prose as the sheet shows it: the table's `amounts` and *names* without their marks. */
export const lubecPlainProse = (text: string): string => text.replace(/[`*]/g, '')

/** The effects in their order, with each wound's linked cards gathered under the first of them. */
export function lubecEffectGroups(effects: readonly LubecEffect[]): { key: string; wound: LubecWoundSource | null; effects: LubecEffect[] }[] {
  const groups: { key: string; wound: LubecWoundSource | null; effects: LubecEffect[] }[] = []
  for (const effect of effects) {
    const wound = lubecEffectWound(effect)
    const existing = wound?.groupId ? groups.find((group) => group.wound?.groupId === wound.groupId) : undefined
    if (existing) existing.effects.push(effect)
    else groups.push({ key: wound?.groupId || effect.id, wound, effects: [effect] })
  }
  return groups
}
